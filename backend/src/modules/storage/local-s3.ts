import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import S3rver from 's3rver';

export interface LocalS3 {
  client: S3Client;
  stop: () => Promise<void>;
}

/**
 * Boots the in-process S3 mock (`s3rver`, devDependency) used when there is no
 * `STORAGE_ENDPOINT` — dev and tests run an S3 server inside the app process,
 * with no extra Docker service (approved storage decision, 17/10/2026).
 */
export async function startLocalS3(bucket: string): Promise<LocalS3> {
  const directory = await mkdtemp(join(tmpdir(), 's3rver-'));
  const server = new S3rver({
    port: 0,
    address: '127.0.0.1',
    silent: true,
    directory,
    configureBuckets: [{ name: bucket, configs: [] }],
  });
  const address = await server.run();
  const client = new S3Client({
    endpoint: `http://127.0.0.1:${address.port}`,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
  });
  return {
    client,
    stop: async () => {
      client.destroy();
      await server.close();
    },
  };
}
