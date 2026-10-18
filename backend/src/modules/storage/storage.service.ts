/**
 * Object storage abstraction (spec etapa-3.md §2.6, docs/stack.md §1).
 *
 * The bytes live outside Postgres; the API serves downloads through this
 * interface (no presigned URLs), so the driver — a real S3-compatible endpoint
 * or the in-process mock — is pure configuration.
 */
export abstract class StorageService {
  /** Stores the bytes under `key` (overwrites an existing object). */
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;

  /** Returns the bytes stored under `key`. */
  abstract get(key: string): Promise<Buffer>;

  /** Best-effort cleanup after a failed write (spec etapa-3.md §11). */
  abstract remove(key: string): Promise<void>;
}
