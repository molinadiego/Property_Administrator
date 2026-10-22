import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/errors';
import type { FileViewDto } from '@/api/types';
import {
  buildFileUrl,
  downloadFile,
  formatFileSize,
  groupOrderFiles,
} from '@/history/files-actions';
import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';

// ---------------------------------------------------------------------------
// Pure file helpers (spec F5 §4/§5, F5-D7).
// ---------------------------------------------------------------------------

const fileFixture = (over: Partial<FileViewDto> = {}): FileViewDto => ({
  id: 'f-1',
  orderId: 'o-1',
  targetType: 'order',
  targetId: 'o-1',
  kind: 'photo',
  filename: 'fachada.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 2048,
  createdAt: '2026-10-12T10:00:00.000Z',
  deletedAt: null,
  ...over,
});

describe('groupOrderFiles (F5-D5)', () => {
  it('splits order-level and per-job files keeping the server order', () => {
    const groups = groupOrderFiles([
      fileFixture({ id: 'f-1', targetType: 'job', targetId: 'j-1' }),
      fileFixture({ id: 'f-2' }),
      fileFixture({ id: 'f-3', targetType: 'job', targetId: 'j-2' }),
      fileFixture({ id: 'f-4', targetType: 'job', targetId: 'j-1' }),
    ]);
    expect(groups.order.map((file) => file.id)).toEqual(['f-2']);
    expect(groups.jobs).toHaveLength(2);
    expect(groups.jobs[0].jobId).toBe('j-1');
    expect(groups.jobs[0].files.map((file) => file.id)).toEqual(['f-1', 'f-4']);
    expect(groups.jobs[1].jobId).toBe('j-2');
    expect(groups.jobs[1].files.map((file) => file.id)).toEqual(['f-3']);
  });

  it('returns empty groups for an empty list', () => {
    expect(groupOrderFiles([])).toEqual({ order: [], jobs: [] });
  });
});

describe('formatFileSize', () => {
  it('formats bytes, KB and MB with one decimal when fractional', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(15 * 1024)).toBe('15 KB');
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});

describe('downloadFile (spec F5 §5, F5-D7)', () => {
  /**
   * jsdom has no object URLs and `a.click()` would navigate: stub both and
   * capture the `download` name the anchor received.
   */
  function stubDownloads() {
    const createObjectURL = vi.fn(() => 'blob:hm-test');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    const state: { downloadedAs?: string } = {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      state.downloadedAs = this.download;
    });
    return { createObjectURL, revokeObjectURL, state };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches with the cookie, then blob + object URL + a[download] on 200', async () => {
    const { createObjectURL, revokeObjectURL, state } = stubDownloads();
    setFetchHandler(() => jsonResponse(200, { ok: true }));

    await downloadFile(buildFileUrl('c-1', 'f-9'), 'fachada.jpg');

    const downloads = apiCalls((call) => call.method === 'GET' && call.url.includes('/files/f-9'));
    expect(downloads).toHaveLength(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(state.downloadedAs).toBe('fachada.jpg');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:hm-test');
  });

  it('maps 404 to ApiError without touching the object URLs', async () => {
    const { createObjectURL } = stubDownloads();
    setFetchHandler(() => problemJson(404, 'Archivo no encontrado o sin acceso.'));

    const error = await downloadFile(buildFileUrl('c-1', 'f-9'), 'fachada.jpg').catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).detail).toBe('Archivo no encontrado o sin acceso.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('maps 503 (storage unavailable) to ApiError', async () => {
    const { createObjectURL } = stubDownloads();
    setFetchHandler(() => problemJson(503, 'Almacenamiento no disponible.'));

    const error = await downloadFile(buildFileUrl('c-1', 'f-9'), 'fachada.jpg').catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('maps a rejected fetch to a network ApiError (status 0)', async () => {
    const { createObjectURL } = stubDownloads();
    setFetchHandler(() => {
      throw new Error('offline');
    });

    const error = await downloadFile(buildFileUrl('c-1', 'f-9'), 'fachada.jpg').catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
