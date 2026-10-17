import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Login rate limit reached (spec etapa-1.md §3: 429 + Retry-After).
 * Nest's HttpException cannot carry response headers, so the filter reads
 * `retryAfterSeconds` and sets the Retry-After header.
 */
export class TooManyAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Demasiados intentos de inicio de sesión. Intenta más tarde.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
