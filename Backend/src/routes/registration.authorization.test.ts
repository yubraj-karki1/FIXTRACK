import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test, { after, before } from 'node:test';
import bcrypt from 'bcrypt';
import { userRepository } from '../repositories/user.repository.js';
import { sessionService } from '../services/session.service.js';
import type { User, UserRole } from '../types/index.js';
import { handleRoutes } from './index.js';

interface ApiResponse<T> {
  data: T;
  message?: string;
}

class CookieCapture {
  private readonly headers = new Map<string, string | string[]>();

  getHeader(name: string): string | string[] | undefined {
    return this.headers.get(name);
  }

  setHeader(name: string, value: string | string[]): void {
    this.headers.set(name, value);
  }
}

const originalFindByEmail = userRepository.findByEmail;
const originalCreate = userRepository.create;
const originalUpdate = userRepository.update;
const createdUsers: User[] = [];
let baseUrl = '';
let closeServer: (() => Promise<void>) | undefined;

before(async () => {
  // Keep authorization tests isolated from MongoDB and the local users.json fallback.
  userRepository.findByEmail = async () => undefined;
  userRepository.create = async (user: User) => {
    createdUsers.push(user);
    return user;
  };
  userRepository.update = async (id, updates) => {
    const existing = await userRepository.findById(id);
    return existing ? { ...existing, ...updates } : undefined;
  };

  const server = createServer((request, response) => {
    void handleRoutes(request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = async () => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

after(async () => {
  userRepository.findByEmail = originalFindByEmail;
  userRepository.create = originalCreate;
  userRepository.update = originalUpdate;
  await closeServer?.();
});

function registrationBody(email: string, role?: UserRole): Record<string, string> {
  return {
    name: 'Security Test User',
    email,
    password: 'Valid!Pass123',
    phone: '+977 9800009999',
    building: 'Maple Hall',
    room: '101',
    ...(role ? { role } : {})
  };
}

function sessionCookie(userId: string): string {
  const capture = new CookieCapture();
  sessionService.issueSession(capture as unknown as ServerResponse, userId);
  const cookies = capture.getHeader('Set-Cookie');
  const session = (Array.isArray(cookies) ? cookies : [cookies]).find((cookie) => cookie?.startsWith('fixtrack_session='));
  assert.ok(session);
  return session.split(';', 1)[0];
}

async function csrfCredentials(userId: string): Promise<{ cookie: string; token: string }> {
  const cookie = sessionCookie(userId);
  const request = { headers: { cookie } } as IncomingMessage;
  return { cookie, token: await sessionService.createCsrfToken(request) };
}

async function postUser(
  path: string,
  body: Record<string, string>,
  credentials?: { cookie: string; token: string }
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(credentials ? { Cookie: credentials.cookie, 'X-CSRF-Token': credentials.token } : {})
    },
    body: JSON.stringify(body)
  });
}

test('public registration ignores an injected Administrator role and creates a Student', async () => {
  const response = await postUser('/api/users', registrationBody('public-admin-injection@example.com', 'Administrator'));
  const payload = await response.json() as ApiResponse<User>;

  assert.equal(response.status, 201);
  assert.equal(payload.data.role, 'Student');
  assert.equal(createdUsers.at(-1)?.role, 'Student');
  assert.notEqual(createdUsers.at(-1)?.password, 'Valid!Pass123');
  assert.equal(await bcrypt.compare('Valid!Pass123', createdUsers.at(-1)?.password || ''), true);
});

test('public registration ignores an injected Maintenance Staff role and creates a Student', async () => {
  const response = await postUser('/api/users', registrationBody('public-staff-injection@example.com', 'Maintenance Staff'));
  const payload = await response.json() as ApiResponse<User>;

  assert.equal(response.status, 201);
  assert.equal(payload.data.role, 'Student');
  assert.equal(createdUsers.at(-1)?.role, 'Student');
});

test('the privileged creation route requires an authenticated session', async () => {
  const response = await postUser(
    '/api/admin/users',
    registrationBody('unauthenticated-privileged@example.com', 'Administrator')
  );

  assert.equal(response.status, 401);
});

test('a non-admin cannot create a privileged user', async () => {
  const credentials = await csrfCredentials('U-1001');
  const countBefore = createdUsers.length;
  const response = await postUser(
    '/api/admin/users',
    registrationBody('student-created-admin@example.com', 'Administrator'),
    credentials
  );

  assert.equal(response.status, 403);
  assert.equal(createdUsers.length, countBefore);
});

test('an administrator can create a privileged user only through the protected route', async () => {
  const credentials = await csrfCredentials('U-3001');
  const response = await postUser(
    '/api/admin/users',
    registrationBody('admin-created-staff@example.com', 'Maintenance Staff'),
    credentials
  );
  const payload = await response.json() as ApiResponse<User>;

  assert.equal(response.status, 201);
  assert.equal(payload.data.role, 'Maintenance Staff');
  assert.equal(createdUsers.at(-1)?.role, 'Maintenance Staff');
  assert.equal(response.headers.get('set-cookie'), null, 'creating another user must not replace the admin session');
});

test('authenticated users can update only the allowed fields on their own profile', async () => {
  const credentials = await csrfCredentials('U-1001');
  const response = await fetch(`${baseUrl}/api/auth/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: credentials.cookie, 'X-CSRF-Token': credentials.token },
    body: JSON.stringify({
      name: 'Aarav Updated', phone: '+977 9800011111', building: 'Cedar Block', room: '119',
      email: 'attacker-controlled@example.com', role: 'Administrator'
    })
  });
  const payload = await response.json() as ApiResponse<User>;

  assert.equal(response.status, 200);
  assert.equal(payload.data.name, 'Aarav Updated');
  assert.equal(payload.data.email, 'aarav@hostel.edu');
  assert.equal(payload.data.role, 'Student');
});

test('only administrators can update another user role or account status', async () => {
  const studentCredentials = await csrfCredentials('U-1001');
  assert.equal((await fetch(`${baseUrl}/api/admin/users/U-2001`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: studentCredentials.cookie, 'X-CSRF-Token': studentCredentials.token },
    body: JSON.stringify({ status: 'Inactive' })
  })).status, 403);

  const adminCredentials = await csrfCredentials('U-3001');
  const response = await fetch(`${baseUrl}/api/admin/users/U-2001`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCredentials.cookie, 'X-CSRF-Token': adminCredentials.token },
    body: JSON.stringify({ status: 'Inactive' })
  });
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as ApiResponse<User>).data.status, 'Inactive');
});
