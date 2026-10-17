import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { TooManyAttemptsException } from '../exceptions/too-many-attempts.exception';

const ERROR_BASE_URL = 'https://api.home-management.dev/errors';

/** RFC 7807 problem detail returned for every error response. */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId?: string;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

/**
 * Global exception filter: maps every thrown error to a single error contract
 * (RFC 7807 `problem+json`). 5xx responses never leak internal error details.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail = this.resolveDetail(exception, status);
    const title = STATUS_CODES[status] ?? 'Error';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}: ${detail}`);
    }

    const problem: ProblemDetail = {
      type: `${ERROR_BASE_URL}/${slugify(title) || status}`,
      title,
      status,
      detail,
      instance: request.originalUrl ?? request.url ?? '/',
      requestId: request.id,
    };

    // Rate limit answers carry Retry-After (spec etapa-1.md §3, §11).
    if (exception instanceof TooManyAttemptsException) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    response.status(status).json(problem);
  }

  private resolveDetail(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return res;
      }
      if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        if (typeof body.detail === 'string') {
          return body.detail;
        }
        if (typeof body.message === 'string') {
          return body.message;
        }
        if (Array.isArray(body.message)) {
          return body.message.map(String).join('; ');
        }
      }
      if (status >= 500) {
        return 'An unexpected error occurred.';
      }
      return exception.message;
    }

    // Unknown (non-HTTP) exceptions never expose internal details.
    return status >= 500 ? 'An unexpected error occurred.' : 'Request failed.';
  }
}
