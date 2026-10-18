import { OnApplicationShutdown } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

/**
 * S3-compatible driver for `StorageService` (spec etapa-3.md §2.6). The same
 * class talks to a real endpoint (prod, via `STORAGE_*` env) or to the
 * in-process `s3rver` mock (dev/test).
 */
export class S3StorageService extends StorageService implements OnApplicationShutdown {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly onShutdown?: () => Promise<void>,
  ) {
    super();
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error('Storage returned an empty body.');
    return Buffer.from(bytes);
  }

  async remove(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  /** Stops the in-process mock (dev/test) so Jest can exit cleanly. */
  async onApplicationShutdown(): Promise<void> {
    this.client.destroy();
    await this.onShutdown?.();
  }
}
