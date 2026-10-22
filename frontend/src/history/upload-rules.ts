import type { components } from '@/api/generated/schema';

/**
 * Pure upload rules (spec F5 §6): a client-side mirror of the backend allowlist
 * and size cap (etapa-3 §11, `FilesService.MAX_FILE_SIZE_BYTES`) so most bad
 * picks never hit the network. The server stays the authority: a 415/422 wins
 * over this mirror (§16.1).
 */

/** `kind` of `UploadFileDto` as accepted by the contract (never hand-written). */
export type UploadKind = NonNullable<components['schemas']['UploadFileDto']['kind']>;

/** Mirror of the backend `MAX_FILE_SIZE_BYTES` (10 MB). */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** The nine accepted MIME types of the etapa-3 §11 allowlist, in contract order. */
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

/** Value for the `<input accept>` so mobile shows the right pickers (F5 §6). */
export const UPLOAD_ACCEPT = ALLOWED_CONTENT_TYPES.join(',');

/** Lowercases and strips parameters (`text/plain; charset=utf-8` → `text/plain`). */
export function bareContentType(contentType: string): string {
  return (contentType.split(';')[0] ?? '').trim().toLowerCase();
}

export function isAllowedContentType(contentType: string): boolean {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(bareContentType(contentType));
}

/** F5-D6: `kind` is inferred from the MIME type — images are photos, the rest documents. */
export function inferFileKind(contentType: string): UploadKind {
  return bareContentType(contentType).startsWith('image/') ? 'photo' : 'document';
}

export type UploadValidationError = 'empty' | 'tooLarge' | 'type';

/** Validates a picked file before uploading; `null` means "go ahead". */
export function validateUploadFile(file: { type: string; size: number }): UploadValidationError | null {
  if (file.size <= 0) return 'empty';
  if (file.size > MAX_FILE_SIZE_BYTES) return 'tooLarge';
  if (!isAllowedContentType(file.type)) return 'type';
  return null;
}
