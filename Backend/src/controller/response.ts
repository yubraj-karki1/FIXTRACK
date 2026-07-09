import type { ServerResponse } from 'node:http';
import type { ApiResponse } from '../types/index.js';

export function sendJson<T>(response: ServerResponse, statusCode: number, payload: ApiResponse<T>): void {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}
