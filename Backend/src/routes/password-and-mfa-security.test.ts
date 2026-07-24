// Coverage for the security hardening added on top of docs/SECURITY_GAP_ANALYSIS.md's
// remaining P1/P2 items: the 12-128 character password policy (plus name/common-password
// checks), and password confirmation before TOTP setup can be confirmed or disabled.
// Run with: npm test (from the Backend directory).

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test, { after, before } from 'node:test';
import bcrypt from 'bcrypt';
import { generateSecret, generateSync } from 'otplib';
import { userRepository } from '../repositories/user.repository.js';
import { encryptSecret } from '../services/secret-encryption.service.js';
import { sessionService } from '../services/session.service.js';
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
const originalCreate = userRepository.create;
let baseUrl = '';
let closeServer: (() => Promise<void>) | undefined;

before(async () => {
  userRepository.findByEmail = async (email) =>
    [...store.values()].find((user) => user.email.toLowerCase() === email.toLowerCase());
  userRepository.findById = async (id) => store.get(id);
  userRepository.create = async (user) => {
    store.set(user.id, user);
    return user;
  };
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
  userRepository.create = originalCreate;
  await closeServer?.();
});

let nextId = 1;
function seedUser(overrides: Partial<User> = {}): User {
  const id = `U-PWMFA-${nextId++}`;
  const user: User = {
    id,
    name: 'Security Test User',
    role: 'Student',
    email: `${id.toLowerCase()}@example.com`,
    phone: '+977 9800000000',
    building: 'Maple Hall',
    room: '101',
    status: 'Active',
    password: bcrypt.hashSync('Correct!Horse9Battery', 12),
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

async function registerWith(password: string, overrides: Record<string, unknown> = {}) {
  return fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'New Student',
      email: `pw-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password,
      phone: '+977 9800000000',
      building: 'Maple Hall',
      room: '102',
      ...overrides
    })
  });
}

test('registration rejects a password shorter than 12 characters', async () => {
  const response = await registerWith('Short1!');
  assert.equal(response.status, 400);
});

test('registration rejects a password longer than 128 characters', async () => {
  const response = await registerWith(`Aa1!${'x'.repeat(126)}`);
  assert.equal(response.status, 400);
});

test('registration accepts a password within the 12-128 character range', async () => {
  const response = await registerWith('Correct!Horse9Battery');
  assert.equal(response.status, 201);
});

test('registration rejects a common password even if it satisfies composition rules', async () => {
  const response = await registerWith('Password123!');
  assert.equal(response.status, 400);
});

test('registration rejects a password containing the account name', async () => {
  const response = await registerWith('Jonathan1!Secure', { name: 'Jonathan Smith' });
  assert.equal(response.status, 400);
});

test('TOTP setup cannot be confirmed with the wrong account password', async () => {
  const user = seedUser();
  const cookie = sessionCookieFor(user);
  const csrfToken = await sessionService.createCsrfToken({ headers: { cookie } } as IncomingMessage);

  const setupResponse = await fetch(`${baseUrl}/api/auth/totp/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ userId: user.id })
  });
  assert.equal(setupResponse.status, 200);
  const setupPayload = await setupResponse.json();
  const secretMatch = /secret=([A-Z0-9]+)/i.exec(setupPayload.data.otpauthUrl);
  assert.ok(secretMatch);
  const code = generateSync({ secret: secretMatch[1] });

  const wrongPasswordResponse = await fetch(`${baseUrl}/api/auth/totp/verify-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ userId: user.id, token: code, currentPassword: 'TotallyWrongPassword1!' })
  });
  assert.equal(wrongPasswordResponse.status, 401);

  const refreshed = await userRepository.findById(user.id);
  assert.equal(refreshed?.totpEnabled, false, 'MFA must not be enabled after a failed password confirmation');
});

test('TOTP setup confirmation issues one-time recovery codes on success', async () => {
  const user = seedUser();
  const cookie = sessionCookieFor(user);
  const csrfToken = await sessionService.createCsrfToken({ headers: { cookie } } as IncomingMessage);

  const setupResponse = await fetch(`${baseUrl}/api/auth/totp/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ userId: user.id })
  });
  const setupPayload = await setupResponse.json();
  const secretMatch = /secret=([A-Z0-9]+)/i.exec(setupPayload.data.otpauthUrl);
  assert.ok(secretMatch);
  const code = generateSync({ secret: secretMatch[1] });

  const verifyResponse = await fetch(`${baseUrl}/api/auth/totp/verify-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ userId: user.id, token: code, currentPassword: 'Correct!Horse9Battery' })
  });
  assert.equal(verifyResponse.status, 200);
  const verifyPayload = await verifyResponse.json();
  assert.equal(verifyPayload.data.recoveryCodes.length, 10);
});

test('a recovery code logs a user in once and is rejected on reuse', async () => {
  const secret = generateSecret();
  const recoveryCode = 'ABCDE-12345';
  const user = seedUser({
    totpEnabled: true,
    totpSecret: encryptSecret(secret),
    // Stored hash is of the normalized (dash-stripped) form - see totp.service.ts.
    recoveryCodeHashes: [bcrypt.hashSync('ABCDE12345', 12)]
  });

  const pendingCapture = new CookieCapture();
  sessionService.issuePendingTotp(pendingCapture as unknown as ServerResponse, user.id);
  const pendingCookies = pendingCapture.getHeader('Set-Cookie');
  const pendingCookie = (Array.isArray(pendingCookies) ? pendingCookies : [pendingCookies])
    .find((cookie) => cookie?.startsWith('fixtrack_totp_pending='));
  assert.ok(pendingCookie);
  const pendingHeader = pendingCookie.split(';', 1)[0];

  const firstUse = await fetch(`${baseUrl}/api/auth/totp/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pendingHeader },
    body: JSON.stringify({ userId: user.id, recoveryCode })
  });
  assert.equal(firstUse.status, 200);

  // Re-issue the same pending challenge cookie for the second attempt, since the first
  // response already replaced it with a full session cookie the client would move on from.
  const pendingCapture2 = new CookieCapture();
  sessionService.issuePendingTotp(pendingCapture2 as unknown as ServerResponse, user.id);
  const pendingCookie2 = (pendingCapture2.getHeader('Set-Cookie') as string[])
    .find((cookie) => cookie?.startsWith('fixtrack_totp_pending='));
  assert.ok(pendingCookie2);

  const secondUse = await fetch(`${baseUrl}/api/auth/totp/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pendingCookie2.split(';', 1)[0] },
    body: JSON.stringify({ userId: user.id, recoveryCode })
  });
  assert.equal(secondUse.status, 400, 'a consumed recovery code must not work a second time');
});

test('disabling TOTP is rejected without the correct account password', async () => {
  const secret = generateSecret();
  const user = seedUser({ totpEnabled: true, totpSecret: encryptSecret(secret) });
  const cookie = sessionCookieFor(user);
  const csrfToken = await sessionService.createCsrfToken({ headers: { cookie } } as IncomingMessage);
  const code = generateSync({ secret });

  const response = await fetch(`${baseUrl}/api/auth/totp/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ userId: user.id, token: code, currentPassword: 'WrongPassword1!' })
  });
  assert.equal(response.status, 401);

  const refreshed = await userRepository.findById(user.id);
  assert.equal(refreshed?.totpEnabled, true, 'MFA must remain enabled after a failed password confirmation');
});
