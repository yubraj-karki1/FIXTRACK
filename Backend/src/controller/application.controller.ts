import type { ServerResponse } from 'node:http';
import { config } from '../config/index.js';
import { sendJson } from './response.js';
import type { HealthResponse } from '../types/index.js';

export const applicationController = {
  health(response: ServerResponse): void {
    sendJson<HealthResponse>(response, 200, {
      data: { status: 'ok', service: config.serviceName }
    });
  }
};
