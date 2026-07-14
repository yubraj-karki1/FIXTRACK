import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import type { IncomingMessage } from 'node:http';
import { readJsonBody } from './body.js';
import { decryptSecret, encryptSecret } from '../services/secret-encryption.service.js';

function request(body: string | Buffer, contentType = 'application/json'): IncomingMessage {
  const stream = Readable.from([body]) as unknown as IncomingMessage;
  stream.headers = { 'content-type': contentType };
  return stream;
}

test('JSON request parsing rejects invalid content types, malformed JSON, and oversized bodies', async () => {
  await assert.rejects(() => readJsonBody(request('{}', 'text/plain')), (error: { statusCode?: number }) => error.statusCode === 415);
  await assert.rejects(() => readJsonBody(request('{invalid')), (error: { statusCode?: number }) => error.statusCode === 400);
  await assert.rejects(
    () => readJsonBody(request(Buffer.alloc(128 * 1024 + 1, 65))),
    (error: { statusCode?: number }) => error.statusCode === 413
  );
});

test('TOTP secrets use authenticated encryption and decrypt only with the server key', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const encryptedOne = encryptSecret(secret);
  const encryptedTwo = encryptSecret(secret);

  assert.match(encryptedOne, /^enc:v1:/);
  assert.notEqual(encryptedOne, secret);
  assert.notEqual(encryptedOne, encryptedTwo, 'random nonces must produce different ciphertexts');
  assert.equal(decryptSecret(encryptedOne), secret);
});
