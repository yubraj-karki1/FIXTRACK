// Central allow-lists for the image upload pipeline.
// Keeping these in one file makes it easy to audit exactly what the server accepts,
// per the OWASP File Upload Cheat Sheet recommendation to allow-list rather than block-list.

/** The only MIME types a client is allowed to declare for an upload. Never trusted alone - see file-validation.service.ts. */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Magic-number signatures (file-type's sniffed mime) that are allowed to back an upload. */
export const ALLOWED_SNIFFED_MIME_TYPES = new Set<string>(ALLOWED_MIME_TYPES);

/**
 * Extensions that must never survive onto disk or be inferred from a client-supplied
 * filename, even though we never trust the extension for validation in the first place.
 * Matched case-insensitively against the original filename as defense in depth.
 */
export const DANGEROUS_EXTENSIONS =
  /\.(php\d?|phtml|phar|jsp|jspx|asp|aspx|cer|exe|dll|bat|cmd|sh|bash|ps1|js|mjs|cjs|html?|svg|zip|jar|com|scr|vbs|wsf|py|rb|pl)$/i;

/** Output container chosen by the re-encode step - never derived from client input. */
export const OUTPUT_EXTENSION_BY_FORMAT = {
  jpeg: '.jpg',
  webp: '.webp'
} as const;

export const uploadLimits = {
  maxFiles: 1,
  /** Rejects a request whose Content-Length already exceeds the limit, before buffering it. */
  maxFieldNameSize: 100,
  maxFieldSize: 2 * 1024 // small non-file fields only (e.g. a caption), never the image itself
};
