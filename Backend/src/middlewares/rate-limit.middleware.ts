import type { IncomingMessage } from 'node:http';
import { config } from '../config/index.js';
import { HttpError } from '../errors/http-error.js';

interface RateLimitRule {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const minute = 60 * 1000;
const rateLimitBuckets = new Map<string, RateLimitBucket>();
let requestCount = 0;

const sensitiveRouteLimits: Record<string, RateLimitRule> = {
  // Login, registration, and TOTP checks are deliberately stricter than read-only endpoints.
  'POST /api/auth/login': { maxRequests: 10, windowMs: 15 * minute },
  'POST /api/users': { maxRequests: 5, windowMs: 15 * minute },
  'POST /api/auth/forgot-password': { maxRequests: 5, windowMs: 15 * minute },
  'POST /api/auth/forgot-password/verify': { maxRequests: 8, windowMs: 15 * minute },
  'POST /api/auth/password-reset': { maxRequests: 5, windowMs: 15 * minute },
  'POST /api/auth/email/verify': { maxRequests: 8, windowMs: 15 * minute },
  'POST /api/auth/totp/verify-login': { maxRequests: 8, windowMs: 15 * minute },
  'POST /api/auth/totp/verify-setup': { maxRequests: 8, windowMs: 15 * minute }
};

function getClientIp(request: IncomingMessage): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (config.trustProxy && typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.socket.remoteAddress || 'unknown';
}

export function assertRateLimit(request: IncomingMessage, pathname: string): void {
  const key = `${request.method || 'GET'} ${pathname}`;
  const rule = sensitiveRouteLimits[key];
  if (!rule) return;

  const now = Date.now();
  requestCount += 1;
  if (requestCount % 100 === 0) {
    for (const [bucketKey, candidate] of rateLimitBuckets) {
      if (candidate.resetAt <= now) rateLimitBuckets.delete(bucketKey);
    }
  }
  const bucketKey = `${key}:${getClientIp(request)}`;
  const bucket = rateLimitBuckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + rule.windowMs });
    return;
  }

  if (bucket.count >= rule.maxRequests) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new HttpError(429, 'Too many requests. Please wait before trying again.', {
      'Retry-After': String(retryAfterSeconds)
    });
  }

  bucket.count += 1;
}
