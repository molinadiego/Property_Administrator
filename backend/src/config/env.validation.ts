export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  /** Superuser-ish connection string used by Prisma CLI (migrations). */
  DATABASE_URL: string;
  /** Least-privilege connection string used by the runtime app (spec etapa-1 §2.6). */
  APP_DATABASE_URL: string;
  EMAIL_TRANSPORT: 'console' | 'resend';
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Optional dev/CI test mailbox (frontend spec F1-D4/§12): the console
   * transport appends each email in full (JSONL) to this file. Never in
   * production (validated). */
  EMAIL_OUTBOX_FILE?: string;
  /** Base URL used to build email links (invitations, password reset). */
  FRONTEND_URL: string;
  /** Optional S3-compatible endpoint; when absent the app boots the in-process
   * s3rver mock (dev/test, spec etapa-3 §2.6 / stack §1). */
  STORAGE_ENDPOINT?: string;
  STORAGE_REGION?: string;
  STORAGE_BUCKET?: string;
  STORAGE_ACCESS_KEY_ID?: string;
  STORAGE_SECRET_ACCESS_KEY?: string;
}

const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;
const EMAIL_TRANSPORT_VALUES = ['console', 'resend'] as const;

/**
 * Validates and normalizes the environment at startup (fail fast on bad config).
 * Used by ConfigModule.forRoot({ validate }).
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const errors: string[] = [];

  const rawNodeEnv = config.NODE_ENV ?? 'development';
  const nodeEnv =
    typeof rawNodeEnv === 'string' && (NODE_ENV_VALUES as readonly string[]).includes(rawNodeEnv)
      ? (rawNodeEnv as Env['NODE_ENV'])
      : undefined;
  if (!nodeEnv) {
    errors.push(`NODE_ENV must be one of: ${NODE_ENV_VALUES.join(', ')}`);
  }

  let port: number | undefined;
  if (config.PORT === undefined || config.PORT === '') {
    port = 3000;
  } else {
    port = Number(config.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push('PORT must be an integer between 1 and 65535');
      port = undefined;
    }
  }

  const databaseUrl = config.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    errors.push('DATABASE_URL is required');
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('DATABASE_URL must be a postgresql:// connection string');
  }

  const appDatabaseUrl = config.APP_DATABASE_URL;
  if (typeof appDatabaseUrl !== 'string' || appDatabaseUrl.trim() === '') {
    errors.push('APP_DATABASE_URL is required');
  } else if (!/^postgres(ql)?:\/\//.test(appDatabaseUrl)) {
    errors.push('APP_DATABASE_URL must be a postgresql:// connection string');
  }

  const rawEmailTransport = config.EMAIL_TRANSPORT ?? 'console';
  const emailTransport =
    typeof rawEmailTransport === 'string' &&
    (EMAIL_TRANSPORT_VALUES as readonly string[]).includes(rawEmailTransport)
      ? (rawEmailTransport as Env['EMAIL_TRANSPORT'])
      : undefined;
  if (!emailTransport) {
    errors.push(`EMAIL_TRANSPORT must be one of: ${EMAIL_TRANSPORT_VALUES.join(', ')}`);
  }

  const resendApiKey =
    typeof config.RESEND_API_KEY === 'string' && config.RESEND_API_KEY.trim() !== ''
      ? config.RESEND_API_KEY
      : undefined;
  const emailFrom =
    typeof config.EMAIL_FROM === 'string' && config.EMAIL_FROM.trim() !== ''
      ? config.EMAIL_FROM
      : undefined;

  if (emailTransport === 'resend') {
    if (!resendApiKey) errors.push('RESEND_API_KEY is required when EMAIL_TRANSPORT=resend');
    if (!emailFrom) errors.push('EMAIL_FROM is required when EMAIL_TRANSPORT=resend');
  }

  const emailOutboxFile =
    typeof config.EMAIL_OUTBOX_FILE === 'string' && config.EMAIL_OUTBOX_FILE.trim() !== ''
      ? config.EMAIL_OUTBOX_FILE.trim()
      : undefined;

  if (emailOutboxFile && rawNodeEnv === 'production') {
    errors.push('EMAIL_OUTBOX_FILE is a dev/CI mailbox and is not allowed in production');
  }

  const frontendUrl =
    typeof config.FRONTEND_URL === 'string' && config.FRONTEND_URL.trim() !== ''
      ? config.FRONTEND_URL.replace(/\/+$/, '')
      : 'http://localhost:3000';

  const optionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

  const storageEndpoint = optionalString(config.STORAGE_ENDPOINT)?.replace(/\/+$/, '');
  const storageRegion = optionalString(config.STORAGE_REGION);
  const storageBucket = optionalString(config.STORAGE_BUCKET);
  const storageAccessKeyId = optionalString(config.STORAGE_ACCESS_KEY_ID);
  const storageSecretAccessKey = optionalString(config.STORAGE_SECRET_ACCESS_KEY);

  if (storageEndpoint && (!storageAccessKeyId || !storageSecretAccessKey)) {
    errors.push('STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY are required when STORAGE_ENDPOINT is set');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    NODE_ENV: nodeEnv as Env['NODE_ENV'],
    PORT: port as number,
    DATABASE_URL: databaseUrl as string,
    APP_DATABASE_URL: appDatabaseUrl as string,
    EMAIL_TRANSPORT: emailTransport as Env['EMAIL_TRANSPORT'],
    FRONTEND_URL: frontendUrl,
    ...(resendApiKey ? { RESEND_API_KEY: resendApiKey } : {}),
    ...(emailFrom ? { EMAIL_FROM: emailFrom } : {}),
    ...(emailOutboxFile ? { EMAIL_OUTBOX_FILE: emailOutboxFile } : {}),
    ...(storageEndpoint ? { STORAGE_ENDPOINT: storageEndpoint } : {}),
    ...(storageRegion ? { STORAGE_REGION: storageRegion } : {}),
    ...(storageBucket ? { STORAGE_BUCKET: storageBucket } : {}),
    ...(storageAccessKeyId ? { STORAGE_ACCESS_KEY_ID: storageAccessKeyId } : {}),
    ...(storageSecretAccessKey ? { STORAGE_SECRET_ACCESS_KEY: storageSecretAccessKey } : {}),
  };
}
