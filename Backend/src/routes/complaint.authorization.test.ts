import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test, { after, before } from 'node:test';
import { complaintRepository } from '../repositories/complaint.repository.js';
import { sessionService } from '../services/session.service.js';
import type { Complaint } from '../types/index.js';
import { handleRoutes } from './index.js';

class CookieCapture {
  private readonly headers = new Map<string, string | string[]>();
  getHeader(name: string): string | string[] | undefined { return this.headers.get(name); }
  setHeader(name: string, value: string | string[]): void { this.headers.set(name, value); }
}

const fixtures: Complaint[] = [
  {
    id: 'FX-AUTH-1', title: 'Assigned repair', category: 'Water', priority: 'High', status: 'Assigned',
    building: 'Maple Hall', room: '204', studentUserId: 'U-1001', student: 'Aarav Sharma',
    staffUserId: 'U-2001', staff: 'Ramesh Karki', submitted: '2026-07-14', description: 'A sufficiently detailed complaint.',
    image: 'https://example.com/evidence.jpg', notes: [], updates: ['Pending', 'Assigned']
  },
  {
    id: 'FX-AUTH-2', title: 'Unassigned repair', category: 'Furniture', priority: 'Low', status: 'Pending',
    building: 'Cedar Block', room: '118', studentUserId: 'U-1002', student: 'Nisha Thapa',
    staff: 'Unassigned', submitted: '2026-07-14', description: 'Another sufficiently detailed complaint.',
    image: 'https://example.com/evidence.jpg', notes: [], updates: ['Pending']
  }
];

const originalFindAll = complaintRepository.findAll;
const originalFindById = complaintRepository.findById;
const originalCreate = complaintRepository.create;
const originalUpdate = complaintRepository.update;
let records: Complaint[] = [];
let baseUrl = '';
let closeServer: (() => Promise<void>) | undefined;

before(async () => {
  records = structuredClone(fixtures);
  complaintRepository.findAll = async () => records;
  complaintRepository.findById = async (id) => records.find((item) => item.id === id);
  complaintRepository.create = async (complaint) => { records.push(complaint); return complaint; };
  complaintRepository.update = async (id, updates) => {
    const record = records.find((item) => item.id === id);
    if (!record) return undefined;
    Object.assign(record, updates);
    return record;
  };

  const server = createServer((request, response) => { void handleRoutes(request, response); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

after(async () => {
  complaintRepository.findAll = originalFindAll;
  complaintRepository.findById = originalFindById;
  complaintRepository.create = originalCreate;
  complaintRepository.update = originalUpdate;
  await closeServer?.();
});

function cookieFor(userId: string): string {
  const capture = new CookieCapture();
  sessionService.issueSession(capture as unknown as ServerResponse, userId);
  const cookies = capture.getHeader('Set-Cookie');
  const session = (Array.isArray(cookies) ? cookies : [cookies]).find((value) => value?.startsWith('fixtrack_session='));
  assert.ok(session);
  return session.split(';', 1)[0];
}

async function credentialsFor(userId: string): Promise<{ Cookie: string; 'X-CSRF-Token': string }> {
  const Cookie = cookieFor(userId);
  const token = await sessionService.createCsrfToken({ headers: { cookie: Cookie } } as IncomingMessage);
  return { Cookie, 'X-CSRF-Token': token };
}

async function get(path: string, userId: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { Cookie: cookieFor(userId) } });
}

async function write(path: string, userId: string, method: 'POST' | 'PATCH', body: object): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...await credentialsFor(userId) },
    body: JSON.stringify(body)
  });
}

test('complaint lists are filtered by student ownership, staff assignment, and administrator role', async () => {
  const student = await (await get('/api/complaints', 'U-1001')).json() as { data: Complaint[] };
  const staff = await (await get('/api/complaints', 'U-2001')).json() as { data: Complaint[] };
  const admin = await (await get('/api/complaints', 'U-3001')).json() as { data: Complaint[] };

  assert.deepEqual(student.data.map((item) => item.id), ['FX-AUTH-1']);
  assert.deepEqual(staff.data.map((item) => item.id), ['FX-AUTH-1']);
  assert.deepEqual(admin.data.map((item) => item.id), ['FX-AUTH-1', 'FX-AUTH-2']);
});

test('inaccessible complaint identifiers return 404 instead of leaking records', async () => {
  assert.equal((await get('/api/complaints/FX-AUTH-2', 'U-1001')).status, 404);
  assert.equal((await get('/api/complaints/FX-AUTH-2', 'U-2001')).status, 404);
});

test('students create complaints owned by their authenticated identity and can cancel only pending complaints', async () => {
  const createResponse = await write('/api/complaints', 'U-1001', 'POST', {
    title: 'New secure complaint', category: 'Electricity', priority: 'Medium', building: 'Maple Hall', room: '204',
    description: 'The room light has stopped working completely.'
  });
  const created = (await createResponse.json() as { data: Complaint }).data;
  assert.equal(createResponse.status, 201);
  assert.equal(created.studentUserId, 'U-1001');
  assert.equal(created.student, 'Aarav Sharma');
  assert.equal(created.status, 'Pending');

  const cancelResponse = await write(`/api/complaints/${created.id}`, 'U-1001', 'PATCH', { status: 'Closed' });
  assert.equal(cancelResponse.status, 200);
  assert.equal(((await cancelResponse.json()) as { data: Complaint }).data.status, 'Closed');
  assert.equal((await write('/api/complaints/FX-AUTH-1', 'U-1001', 'PATCH', { status: 'Closed' })).status, 403);
});

test('maintenance staff can update only assigned work through valid status transitions', async () => {
  const start = await write('/api/complaints/FX-AUTH-1', 'U-2001', 'PATCH', { status: 'In Progress', note: 'Work started.' });
  assert.equal(start.status, 200);
  assert.equal(((await start.json()) as { data: Complaint }).data.status, 'In Progress');

  const resolve = await write('/api/complaints/FX-AUTH-1', 'U-2001', 'PATCH', { status: 'Resolved' });
  assert.equal(resolve.status, 200);
  assert.equal((await write('/api/complaints/FX-AUTH-2', 'U-2001', 'PATCH', { status: 'In Progress' })).status, 404);
  assert.equal((await write('/api/complaints', 'U-2001', 'POST', {
    title: 'Forbidden staff complaint', category: 'Other', priority: 'Low', building: 'Maple Hall', room: '1',
    description: 'Staff must not create a student complaint.'
  })).status, 403);
});

test('administrators can assign active maintenance staff and update complaint priority', async () => {
  const response = await write('/api/complaints/FX-AUTH-2', 'U-3001', 'PATCH', {
    staffUserId: 'U-2002', priority: 'Emergency'
  });
  const updated = (await response.json() as { data: Complaint }).data;
  assert.equal(response.status, 200);
  assert.equal(updated.staffUserId, 'U-2002');
  assert.equal(updated.status, 'Assigned');
  assert.equal(updated.priority, 'Emergency');
});
