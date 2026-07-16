import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load local settings without overwriting environment variables supplied by the host.
const envFile = resolve(process.cwd(), '.env');

if (existsSync(envFile)) {
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    process.env[key] ??= value;
  }
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4000),
  serviceName: process.env.SERVICE_NAME || 'FixTrack backend',
  publicOrigin: process.env.PUBLIC_ORIGIN || 'http://localhost:4000',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  trustProxy: process.env.TRUST_PROXY === 'true',
  requireHttps: process.env.NODE_ENV === 'production' && process.env.REQUIRE_HTTPS !== 'false',
  httpsKeyPath: process.env.HTTPS_KEY_PATH || '',
  httpsCertPath: process.env.HTTPS_CERT_PATH || '',
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDatabase: process.env.MONGODB_DATABASE || 'fixtrack',
  seedDemoData: process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA !== 'false',
  jwtSecret:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : 'fixtrack-development-only-secret-change-before-production'),
  jwtIssuer: process.env.JWT_ISSUER || 'fixtrack-api',
  jwtAudience: process.env.JWT_AUDIENCE || 'fixtrack-web',
  jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN_SECONDS || 8 * 60 * 60),
  // The HttpOnly session cookie is the only supported credential unless an operator
  // explicitly opts a non-browser client into the Authorization: Bearer fallback.
  allowBearerFallback: process.env.ALLOW_BEARER_FALLBACK === 'true',
  totpEncryptionKey:
    process.env.TOTP_ENCRYPTION_KEY ||
    (process.env.NODE_ENV === 'production' ? '' : 'fixtrack-development-totp-key-change-before-production')
};

if (config.isProduction && Buffer.byteLength(config.jwtSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters in production');
}

if (config.isProduction && Buffer.byteLength(config.totpEncryptionKey, 'utf8') < 32) {
  throw new Error('TOTP_ENCRYPTION_KEY must contain at least 32 characters in production');
}

if (config.isProduction && new URL(config.publicOrigin).protocol !== 'https:') {
  throw new Error('PUBLIC_ORIGIN must use HTTPS in production');
}

if (config.isProduction && !config.mongodbUri) {
  throw new Error('MONGODB_URI is required in production');
}

if (config.isProduction && config.corsOrigin.split(',').some((origin) => origin.trim() === '*')) {
  throw new Error('CORS_ORIGIN cannot contain * when credential cookies are enabled');
}

const corsOrigins = config.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);
const hasOnlyHttpsCorsOrigins = corsOrigins.every((origin) => {
  try {
    return new URL(origin).protocol === 'https:';
  } catch {
    return false;
  }
});

const hasDirectHttps = Boolean(config.httpsKeyPath && config.httpsCertPath);
if (Boolean(config.httpsKeyPath) !== Boolean(config.httpsCertPath)) {
  throw new Error('HTTPS_KEY_PATH and HTTPS_CERT_PATH must be configured together');
}

if (config.isProduction && !hasOnlyHttpsCorsOrigins) {
  throw new Error('Production CORS origins must use HTTPS');
}

if (config.requireHttps && !config.trustProxy && !hasDirectHttps) {
  throw new Error('Production HTTPS requires TRUST_PROXY=true or HTTPS_KEY_PATH and HTTPS_CERT_PATH');
}
