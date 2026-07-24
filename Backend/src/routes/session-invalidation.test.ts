// Coverage for the two P0 fixes identified in docs/SECURITY_GAP_ANALYSIS.md:
//   1. Sessions issued before a password reset/change, role change, or MFA disable must stop
//      working immediately (sessionVersion invalidation), instead of surviving up to 8 hours.
//   2. POST /api/auth/totp/disable must be rate-limited like the other TOTP challenge routes.
// Run with: npm test (from the Backend directory).

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test, { after, before } from 'node:test';
import bcrypt from 'bcrypt';
import { generateSecret, generateSync } from 'otplib';
import { userRepository } from '../repositories/user.repository.js';
import { authService } from '../services/auth.service.js';
import { encryptSecret } from '../services/secret-encryption.service.js';
import { sessionService } from '../services/session.service.js';
import { notificationService } from '../services/notification.service.js';
import { verifyAndLoadActiveUser } from '../services/jwt-verification.service.js';
import type { User } from '../types/index.js';
import { handleRoutes } from './index.js';

class CookieCapture {
  private readonly headers = new Map<string, string | string[]>();
  getHeader(name: string): string | string[] | undefined { return this.headers.get(name); }
  setHeader(name: string, value: string | string[]): void { this.headers.set(name, value); }
}

const store = new Map<string, User>();
const originalFindByEmail = userRepository.findByEmail;
const originalFindById = userRepository.findById;
const originalUpdate = userRepository.update;
let baseUrl = '';
let closeServer: (() => Promise<void>) | undefined;

before(async () => {
  userRepository.findByEmail = async (email) =>
    [...store.values()].find((user) => user.email.toLowerCase() === email.toLowerCase());
  userRepository.findById = async (id) => store.get(id);
  userRepository.update = async (id, updates) => {
    const existing = store.get(id);
    if (!existing) return undefined;
    const merged: User = { ...existing, ...updates };
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined) delete (merged as unknown as Record<string, unknown>)[key];
    });
    store.set(id, merged);
    return merged;
  };

  const server = createServer((request, response) => { void handleRoutes(request, response); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = async () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

after(async () => {
  userRepository.findByEmail = originalFindByEmail;
  userRepository.findById = originalFindById;
  userRepository.update = originalUpdate;
  await closeServer?.();
});

let nextId = 1;
function seedUser(overrides: Partial<User> = {}): User {
  const id = `U-SESSION-${nextId++}`;
  const user: User = {
    id,
    name: 'Session Test User',
    role: 'Student',
    email: `${id.toLowerCase()}@example.com`,
    phone: '+977 9800000000',
    building: 'Maple Hall',
    room: '101',
    status: 'Active',
    password: bcrypt.hashSync('Valid!Pass123', 12),
    totpEnabled: false,
    ...overrides
  };
  store.set(id, user);
  return user;
}

function sessionCookieFor(user: Pick<User, 'id' | 'sessionVersion'>): string {
  const capture = new CookieCapture();
  sessionService.issueSession(capture as unknown as ServerResponse, user);
  const cookies = capture.getHeader('Set-Cookie');
  const session = (Array.isArray(cookies) ? cookies : [cookies]).find((cookie) => cookie?.startsWith('fixtrack_session='));
  assert.ok(session, 'a session cookie should be issued');
  return session.split(';', 1)[0];
}

function tokenFromCookie(cookie: string): string {
  return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
}

test('a session token issued before a sessionVersion bump is rejected afterward', async () => {
  const user = seedUser();
  const token = tokenFromCookie(sessionCookieFor(user));

  // Valid immediately after issuance.
  await assert.doesNotReject(() => verifyAndLoadActiveUser(token));

  // Simulate the version bump made by password reset/change, role change, or MFA disable.
  await userRepository.update(user.id, { sessionVersion: (user.sessionVersion ?? 0) + 1 });

  await assert.rejects(
    () => verifyAndLoadActiveUser(token),
    (error: { statusCode?: number }) => error.statusCode === 401
  );
});

test('resetting a password invalidates a previously issued session cookie', async () => {
  const user = seedUser();
  const staleCookie = sessionCookieFor(user);

  const beforeReset = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: staleCookie } });
  assert.equal(beforeReset.status, 200, 'the cookie should authenticate before the reset');

  let capturedCode = '';
  const originalSend = notificationService.sendPasswordResetCode;
  notificationService.sendPasswordResetCode = async (_email: string, code: string) => {
    capturedCode = code;
  };
  try {
    await authService.requestPasswordReset(user.email);
  } finally {
    notificationService.sendPasswordResetCode = originalSend;
  }
  assert.match(capturedCode, /^\d{6}$/);

  await authService.resetPassword(user.email, capturedCode, 'NewValid!Pass456');

  const afterReset = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: staleCookie } });
  assert.equal(afterReset.status, 401, 'a session issued before the reset must no longer authenticate');
});

test('changing an expired password invalidates a stale session and issues a working replacement', async () => {
  const user = seedUser();
  const staleCookie = sessionCookieFor(user);

  const pendingCapture = new CookieCapture();
  sessionService.issuePendingPasswordChange(pendingCapture as unknown as ServerResponse, user.id);
  const pendingCookies = pendingCapture.getHeader('Set-Cookie');
  const pendingCookie = (Array.isArray(pendingCookies) ? pendingCookies : [pendingCookies])
    .find((cookie) => cookie?.startsWith('fixtrack_password_pending='));
  assert.ok(pendingCookie);

  const response = await fetch(`${baseUrl}/api/auth/password/expired-change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pendingCookie.split(';', 1)[0] },
    body: JSON.stringify({ userId: user.id, newPassword: 'NewValid!Pass789' })
  });
  assert.equal(response.status, 200);
  const freshCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith('fixtrack_session='));
  assert.ok(freshCookie, 'a fresh session cookie should be issued after the expired-password change');

  const staleCheck = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: staleCookie } });
  assert.equal(staleCheck.status, 401, 'a session issued before the forced change must no longer authenticate');

  const freshCheck = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: freshCookie!.split(';', 1)[0] } });
  assert.equal(freshCheck.status, 200, 'the newly issued session must authenticate');
});

test("an administrator changing a user's role invalidates that user's existing session", async () => {
  const target = seedUser({ role: 'Student' });
  const admin = seedUser({ role: 'Administrator' });
  const staleCookie = sessionCookieFor(target);

  const adminCookie = sessionCookieFor(admin);
  const csrfToken = await sessionService.createCsrfToken({ headers: { cookie: adminCookie } } as IncomingMessage);

  const response = await fetch(`${baseUrl}/api/admin/users/${target.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ role: 'Maintenance Staff' })
  });
  assert.equal(response.status, 200);

  const staleCheck = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: staleCookie } });
  assert.equal(staleCheck.status, 401, "a session issued under the user's old role must no longer authenticate");
});

test('disabling TOTP invalidates a stale session and reissues a working replacement for the actor', async () => {
  const secret = generateSecret();
  const user = seedUser({ totpEnabled: true, totpSecret: encryptSecret(secret) });
  const staleCookie = sessionCookieFor(user);

  const currentCookie = sessionCookieFor(user);
  const csrfToken = await sessionService.createCsrfToken({ headers: { cookie: currentCookie } } as IncomingMessage);
  const code = generateSync({ secret });

  const response = await fetch(`${baseUrl}/api/auth/totp/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: currentCookie, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ userId: user.id, token: code, currentPassword: 'Valid!Pass123' })
  });
  assert.equal(response.status, 200);
  const freshCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith('fixtrack_session='));
  assert.ok(freshCookie, 'the caller who disabled MFA should receive a fresh working session');

  const staleCheck = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: staleCookie } });
  assert.equal(staleCheck.status, 401, 'a session issued before the disable must no longer authenticate');

  const freshCheck = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: freshCookie!.split(';', 1)[0] } });
  assert.equal(freshCheck.status, 200, 'the reissued session for the caller must still authenticate');
});

test('POST /api/auth/totp/disable is rate limited', async () => {
  // An earlier test in this file already spent one slot in the same IP+route bucket
  // (the successful disable call), so this asserts the invariant rather than an exact
  // attempt count: the first request in this run is not immediately blocked, but the
  // limiter does kick in well before it would let an unbounded number of guesses through.
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/totp/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'U-DOES-NOT-EXIST', token: '000000' })
    });
    statuses.push(response.status);
  }

  assert.notEqual(statuses[0], 429, 'the first attempt in this run should not be immediately rate limited');
  assert.ok(statuses.includes(429), 'repeated attempts to disable TOTP must eventually be rate limited');
});
