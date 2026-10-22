import { describe, expect, it } from 'vitest';

import {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_SIZE_BYTES,
  UPLOAD_ACCEPT,
  inferFileKind,
  isAllowedContentType,
  validateUploadFile,
} from '@/history/upload-rules';

// ---------------------------------------------------------------------------
// Upload rules mirror (spec F5 §6, AC-F5.16; etapa-3 §11 allowlist).
// ---------------------------------------------------------------------------

describe('upload rules mirror (spec F5 §6)', () => {
  it('accepts exactly the nine backend content types', () => {
    expect(ALLOWED_CONTENT_TYPES).toHaveLength(9);
    for (const type of ALLOWED_CONTENT_TYPES) {
      expect(isAllowedContentType(type)).toBe(true);
    }
    // Legacy Office types are NOT in the contract allowlist, nor other images.
    expect(isAllowedContentType('application/msword')).toBe(false);
    expect(isAllowedContentType('application/vnd.ms-excel')).toBe(false);
    expect(isAllowedContentType('image/gif')).toBe(false);
    expect(isAllowedContentType('application/x-sh')).toBe(false);
  });

  it('compares only the bare type (multer may append parameters)', () => {
    expect(isAllowedContentType('text/plain; charset=utf-8')).toBe(true);
    expect(isAllowedContentType('IMAGE/JPEG; charset=binary')).toBe(true);
    expect(inferFileKind('text/plain; charset=utf-8')).toBe('document');
  });

  it('infers kind from the MIME type (F5-D6)', () => {
    expect(inferFileKind('image/jpeg')).toBe('photo');
    expect(inferFileKind('image/webp')).toBe('photo');
    expect(inferFileKind('application/pdf')).toBe('document');
    expect(inferFileKind('text/csv')).toBe('document');
    expect(inferFileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      'document',
    );
  });

  it('validates size and type: (0, 10 MB] plus the allowlist', () => {
    expect(validateUploadFile({ type: 'image/png', size: 1 })).toBeNull();
    expect(validateUploadFile({ type: 'image/png', size: MAX_FILE_SIZE_BYTES })).toBeNull();
    expect(validateUploadFile({ type: 'image/png', size: 0 })).toBe('empty');
    expect(validateUploadFile({ type: 'image/png', size: MAX_FILE_SIZE_BYTES + 1 })).toBe(
      'tooLarge',
    );
    expect(validateUploadFile({ type: 'application/x-msdownload', size: 10 })).toBe('type');
  });

  it('offers the allowlist to the input accept attribute (F5 §6)', () => {
    expect(UPLOAD_ACCEPT.split(',')).toEqual([...ALLOWED_CONTENT_TYPES]);
  });
});
