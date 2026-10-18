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

/**
 * Multer's multipart failures (`LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`, …) are
 * client input problems, not server faults: they map to 422 (spec etapa-3.md
 * §11, matriz #33). Duck-typed on purpose so the filter does not depend on
 * multer's internals.
 */
function isMulterError(exception: unknown): exception is Error & { code: string } {
  if (!(exception instanceof Error)) return false;
  const code = (exception as Error & { code?: unknown }).code;
  return typeof code === 'string' && code.startsWith('LIMIT_');
}

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

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : isMulterError(exception)
          ? HttpStatus.UNPROCESSABLE_ENTITY
          : HttpStatus.INTERNAL_SERVER_ERROR;
    // Nest maps multer's LIMIT_FILE_SIZE to a 413 PayloadTooLarge; in multipart
    // uploads the spec (etapa-3.md §11, matriz #33) demands a 422, so the two
    // are reconciled here — JSON payload limits keep their 413.
    const isMultipart = String(request.headers['content-type'] ?? '').includes(
      'multipart/form-data',
    );
    const multipartSizeExceeded = status === HttpStatus.PAYLOAD_TOO_LARGE && isMultipart;
    if (multipartSizeExceeded) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
    }
    const detail = multipartSizeExceeded
      ? 'El archivo supera el máximo permitido de 10 MB.'
      : this.resolveDetail(exception, status);
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

    if (isMulterError(exception)) {
      return exception.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el máximo permitido de 10 MB.'
        : `Archivo multipart inválido: ${exception.message}.`;
    }

    // Unknown (non-HTTP) exceptions never expose internal details.
    return status >= 500 ? 'An unexpected error occurred.' : 'Request failed.';
  }
}
