// Multipart text fields (e.g. a complaint image caption / alt text) never pass through the
// JSON-body validation pipeline in validation.middleware.ts, so they get their own sanitizer
// using the same xss configuration - strip all tags, never allow markup through.

import xss from 'xss';
import { HttpError } from '../errors/http-error.js';

const xssOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style']
};

const maxCaptionLength = 300;

export function sanitizeCaption(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'Caption must be text.');
  }

  const trimmed = raw.trim();
  if (trimmed.length > maxCaptionLength) {
    throw new HttpError(400, `Caption must be ${maxCaptionLength} characters or fewer.`);
  }

  const cleaned = xss(trimmed, xssOptions);
  return cleaned || undefined;
}
