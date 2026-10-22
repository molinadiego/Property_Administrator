import { ApiError } from '@/api/errors';
import type { FileViewDto } from '@/api/types';

/**
 * Pure file helpers (spec F5 §4/§5): grouping for the order-detail screens and
 * the F5-D7 download (`fetch` → blob → `a.download`, same-origin cookie).
 * Server checked on every request (§16.1): a 404/503 surfaces as `ApiError`
 * and the UI shows a banner — never a file's data (§16.8).
 */

/** Minimal shape shared by `FileViewDto` and the history `HistoryFileViewDto`. */
export interface FileRowData {
  id: string;
  kind: FileViewDto['kind'];
  filename: string;
  sizeBytes: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface OrderFilesGroup {
  /** Files with `targetType: 'order'` (the order-level card). */
  order: FileViewDto[];
  /** Files with `targetType: 'job'`, bucketed per job, server order preserved. */
  jobs: Array<{ jobId: string; files: FileViewDto[] }>;
}

/**
 * Splits the visible files of an order into the order-level card and the
 * per-job evidence subsections (F5-D5). Input order (createdAt desc) is kept.
 */
export function groupOrderFiles(files: readonly FileViewDto[]): OrderFilesGroup {
  const order: FileViewDto[] = [];
  const jobs = new Map<string, FileViewDto[]>();
  for (const file of files) {
    if (file.targetType === 'order') {
      order.push(file);
      continue;
    }
    const bucket = jobs.get(file.targetId);
    if (bucket) bucket.push(file);
    else jobs.set(file.targetId, [file]);
  }
  return { order, jobs: [...jobs.entries()].map(([jobId, jobFiles]) => ({ jobId, files: jobFiles })) };
}

/** Human byte size without floating-point money rules (this is not money, §12). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Absolute same-origin download URL (client baseUrl pattern, F5-D7). */
export function buildFileUrl(companyId: string, fileId: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/api/v1/companies/${companyId}/files/${fileId}`;
}

/**
 * Downloads one file (F5-D7): fetch with the session cookie, then blob +
 * object URL + `a[download]`. Failures are normalised into `ApiError` (404
 * without access / retired file, 503 storage, 0 network) so callers can show
 * the RFC 7807 message or a status-specific fallback.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include' });
  } catch (cause) {
    throw ApiError.network(cause);
  }
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    throw ApiError.fromResponse(response, body);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
