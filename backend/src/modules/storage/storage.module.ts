import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { S3StorageService } from './s3-storage.service';
import { startLocalS3 } from './local-s3';
import { StorageService } from './storage.service';

/**
 * Global storage provider (spec etapa-3.md §2.7):
 *
 * - `STORAGE_ENDPOINT` set → talk to that S3-compatible endpoint (prod).
 * - Otherwise → boot the in-process `s3rver` mock with a temp directory
 *   (dev/test, approved storage decision 17/10/2026).
 */
@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const bucket = config.get<string>('STORAGE_BUCKET') ?? 'home-management';
        const endpoint = config.get<string>('STORAGE_ENDPOINT');
        if (endpoint) {
          const client = new S3Client({
            endpoint,
            region: config.get<string>('STORAGE_REGION') ?? 'us-east-1',
            forcePathStyle: true,
            credentials: {
              accessKeyId: config.getOrThrow<string>('STORAGE_ACCESS_KEY_ID'),
              secretAccessKey: config.getOrThrow<string>('STORAGE_SECRET_ACCESS_KEY'),
            },
          });
          return new S3StorageService(client, bucket);
        }
        const local = await startLocalS3(bucket);
        return new S3StorageService(local.client, bucket, local.stop);
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
