/**
 * Pure validation rules for file uploads (docs/especificacion/etapa-3.md §11,
 * matriz de permisos #33). No Nest, no Prisma — unit-testable in isolation.
 */

/** Hard cap for an uploaded file (10 MB). */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Allowlist of accepted content types (spec §11: "allowlist estricta"). */
export const ALLOWED_CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  // Office (openxml)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export function isAllowedContentType(contentType: string): boolean {
  // `multer` may append parameters (e.g. `; charset=utf-8`); only the bare
  // type participates in the allowlist decision.
  const bare = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return ALLOWED_CONTENT_TYPES.includes(bare);
}

export function isAllowedSize(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE_BYTES;
}

/**
 * Sanitizes an original filename: strips any path, control characters and
 * separators. The storage key is a generated UUID, so this value is only ever
 * metadata and must never be echoed into `Content-Disposition` unencoded.
 */
export function sanitizeFilename(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return 'file';
  return cleaned.slice(0, 255);
}

/** `Content-Disposition` value: ASCII fallback + RFC 5987 UTF-8 variant. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
