import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config/index.js';

export function applyCors(_request: IncomingMessage, response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
