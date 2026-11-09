import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/** Postgres error codes we translate into client errors. */
const PG_ERRORS: Record<string, { status: HttpStatus; message: string }> = {
  '23505': { status: HttpStatus.CONFLICT, message: 'A record with the same unique value already exists' },
  '23503': { status: HttpStatus.CONFLICT, message: 'The record is referenced by, or references, other data' },
  '23514': { status: HttpStatus.CONFLICT, message: 'The change would violate a data rule' },
  '22P02': { status: HttpStatus.BAD_REQUEST, message: 'Invalid input value' },
  '22008': { status: HttpStatus.BAD_REQUEST, message: 'Invalid date' },
  '22003': { status: HttpStatus.BAD_REQUEST, message: 'Numeric value out of range' },
  '40P01': { status: HttpStatus.CONFLICT, message: 'Concurrent update, please retry' },
};

/**
 * Converts every error into one consistent JSON shape:
 *
 *   { statusCode, error, message, details?, path, method, timestamp, requestId }
 *
 * Unknown errors become a generic 500 so internals (SQL, stack traces) never
 * leak to clients; the full error is still logged with the request id.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const raw = (body as { message?: string | string[] }).message;
        if (Array.isArray(raw)) {
          // class-validator returns a list; expose all of them.
          details = raw;
          message = raw[0] ?? 'Validation failed';
        } else if (raw) {
          message = raw;
        }
      }
    } else if (isPgError(exception) && PG_ERRORS[exception.code]) {
      ({ status, message } = PG_ERRORS[exception.code]);
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      ...(details && details.length > 1 ? { details } : {}),
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}
