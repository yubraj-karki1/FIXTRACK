// Integration coverage for the cookie-bound CSRF boundary.
// Run with: npm test (from the Backend directory).

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { once } from 'node:events';
import { handleRoutes } from './index.js';
import { sessionService } from '../services/session.service.js';

class CookieCapture {
  private readonly headers = new Map<string, string | string[]>();

  getHeader(name: string): string | string[] | undefined {
    return this.headers.get(name);
  }

  setHeader(name: string, value: string | string[]): void {
    this.headers.set(name, value);
  }
}

function getSessionCookie(): string {
  const capture = new CookieCapture();
  // The service only uses getHeader/setHeader when issuing cookies.
  sessionService.issueSession(capture as unknown as ServerResponse, { id: 'U-3001' });
  const cookies = capture.getHeader('Set-Cookie');
  const session = (Array.isArray(cookies) ? cookies : [cookies]).find((cookie) => cookie?.startsWith('fixtrack_session='));
  assert.ok(session, 'a login session cookie should be issued');
  return session.split(';', 1)[0];
}

function getPendingTotpCookie(): string {
  const capture = new CookieCapture();
  sessionService.issuePendingTotp(capture as unknown as ServerResponse, 'U-3001');
  const cookies = capture.getHeader('Set-Cookie');
  const pending = (Array.isArray(cookies) ? cookies : [cookies]).find((cookie) => cookie?.startsWith('fixtrack_totp_pending='));
  assert.ok(pending, 'a pending TOTP cookie should be issued');
  assert.match(pending, /Path=\/api\/auth/i);
  return pending.split(';', 1)[0];
}

function createRequest(cookie: string, csrfToken?: string): IncomingMessage {
  return {
    headers: {
      cookie,
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
    }
  } as IncomingMessage;
}

async function startApiServer() {
  const server = createServer((request, response) => {
    void handleRoutes(request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

test('accepts a valid CSRF token tied to the authenticated administrator session', async () => {
  const cookie = getSessionCookie();
  const token = await sessionService.createCsrfToken(createRequest(cookie));
  await sessionService.assertCsrfToken(createRequest(cookie, token));
});

test('rejects a missing or invalid CSRF token with 403', async () => {
  const cookie = getSessionCookie();

  await assert.rejects(
    () => sessionService.assertCsrfToken(createRequest(cookie)),
    (error: { statusCode?: number }) => error.statusCode === 403
  );
  await assert.rejects(
    () => sessionService.assertCsrfToken(createRequest(cookie, 'not-a-signed-token')),
    (error: { statusCode?: number }) => error.statusCode === 403
  );
});

test('keeps the TOTP challenge separate from the full session and gives an actionable expiry error', () => {
  const pendingCookie = getPendingTotpCookie();

  // A valid five-minute challenge authorizes only the matching account's second factor.
  assert.doesNotThrow(() => sessionService.assertPendingTotpUser(createRequest(pendingCookie), 'U-3001'));
  assert.throws(
    () => sessionService.assertPendingTotpUser(createRequest(''), 'U-3001'),
    (error: { statusCode?: number; message?: string }) =>
      error.statusCode === 401 && error.message === 'Two-factor login session expired. Please sign in again.'
  );
});

test('allows GET requests without a CSRF header and protects administrator write dispatch', async () => {
  const api = await startApiServer();
  const cookie = getSessionCookie();

  try {
    // GET is intentionally safe-method exempt, even for the administrator-only user directory.
    const readResponse = await fetch(`${api.baseUrl}/api/users`, { headers: { Cookie: cookie } });
    assert.equal(readResponse.status, 200);

    // A missing header is rejected before an unknown future/admin write route can dispatch.
    const blockedWrite = await fetch(`${api.baseUrl}/api/users/U-1001`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(blockedWrite.status, 403);
  } finally {
    await api.close();
  }
});

test('logout requires CSRF protection and clears the HttpOnly session cookie', async () => {
  const api = await startApiServer();
  const cookie = getSessionCookie();
  const token = await sessionService.createCsrfToken(createRequest(cookie));

  try {
    const response = await fetch(`${api.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': token }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') || '', /fixtrack_session=.*Max-Age=0/i);

    // The old token cannot authorize a new session after logout/login because its session id differs.
    const nextCookie = getSessionCookie();
    await assert.rejects(
      () => sessionService.assertCsrfToken(createRequest(nextCookie, token)),
      (error: { statusCode?: number }) => error.statusCode === 403
    );
  } finally {
    await api.close();
  }
});
