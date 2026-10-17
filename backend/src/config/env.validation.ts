export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
}

const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;

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

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    NODE_ENV: nodeEnv as Env['NODE_ENV'],
    PORT: port as number,
    DATABASE_URL: databaseUrl as string,
  };
}
