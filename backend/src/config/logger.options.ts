import { randomUUID } from 'node:crypto';

/**
 * pino-http options shared by the API.
 * Sensitive headers are redacted so cookies and tokens never reach the logs.
 */
export function getLoggerOptions() {
  const usePretty = !['production', 'test'].includes(process.env.NODE_ENV ?? 'development');

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? 'info',
      genReqId: () => randomUUID(),
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[REDACTED]',
      },
      ...(usePretty
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, singleLine: true },
            },
          }
        : {}),
    },
  };
}
