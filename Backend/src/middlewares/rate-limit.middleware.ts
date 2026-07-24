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
  'POST /api/auth/password-reset': { maxRequests: 8, windowMs: 15 * minute },
  'POST /api/auth/password/expired-change': { maxRequests: 8, windowMs: 15 * minute },
  'POST /api/auth/email/verify': { maxRequests: 8, windowMs: 15 * minute },
  'POST /api/auth/totp/verify-login': { maxRequests: 8, windowMs: 15 * minute },
  'POST /api/auth/totp/verify-setup': { maxRequests: 8, windowMs: 15 * minute },
  // Recovery codes are single-use but still guessable in principle, so throttle exactly
  // like the other TOTP verification routes.
  'POST /api/auth/totp/recover': { maxRequests: 8, windowMs: 15 * minute },
  // Disabling MFA is also gated by a 6-digit code check (see totpService.disable), so it
  // needs the same brute-force throttling as the verify routes.
  'POST /api/auth/totp/disable': { maxRequests: 8, windowMs: 15 * minute },
  // Uploads are CPU/IO heavy (Sharp decode + re-encode, optional ClamAV scan) and, unlike a
  // login attempt, cost real disk/bandwidth per request - throttled well below general traffic.
  'POST /api/profile/avatar': { maxRequests: 10, windowMs: 15 * minute },
  'GET /api/users/me/export': { maxRequests: 10, windowMs: 60 * minute },
  'POST /api/complaints/:id/image': { maxRequests: 10, windowMs: 15 * minute }
};

// Routes with a dynamic segment are rewritten to their route-pattern form before the rate
// limit key is built, so /api/complaints/FX-1/image and /api/complaints/FX-2/image share a
// bucket per client rather than each getting their own unlimited allowance.
const dynamicPathPatterns: Array<[RegExp, string]> = [[/^\/api\/complaints\/[^/]+\/image$/, '/api/complaints/:id/image']];

function normalizePathname(pathname: string): string {
  const match = dynamicPathPatterns.find(([pattern]) => pattern.test(pathname));
  return match ? match[1] : pathname;
}

export function getClientIp(request: IncomingMessage): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (config.trustProxy && typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.socket.remoteAddress || 'unknown';
}

export function assertRateLimit(request: IncomingMessage, pathname: string): void {
  const key = `${request.method || 'GET'} ${normalizePathname(pathname)}`;
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

// Caps how many uploads a single user can have in flight at once, independent of the
// time-windowed request-count limit above. Protects CPU/memory (Sharp + ClamAV both hold
// full-file buffers) from a burst of parallel requests from one account.
const activeUploadsByUser = new Map<string, number>();

export function acquireUploadSlot(userId: string): void {
  const current = activeUploadsByUser.get(userId) ?? 0;
  if (current >= config.maxConcurrentUploadsPerUser) {
    throw new HttpError(429, 'Too many uploads in progress. Please wait for the current one to finish.');
  }
  activeUploadsByUser.set(userId, current + 1);
}

export function releaseUploadSlot(userId: string): void {
  const current = activeUploadsByUser.get(userId) ?? 0;
  if (current <= 1) activeUploadsByUser.delete(userId);
  else activeUploadsByUser.set(userId, current - 1);
}
