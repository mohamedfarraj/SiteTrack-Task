import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const requestId = request.headers['x-request-id'] || 'unknown';

    let message: string | string[] = 'An error occurred';
    let error = exception.name;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const res = exceptionResponse as {
        statusCode?: number;
        message?: string | string[];
        error?: string;
      };

      if (res.message) {
        message = Array.isArray(res.message) ? res.message[0] : res.message;
      }

      if (res.error) {
        error = res.error;
      }

      // Handle validation errors
      if (res.statusCode === HttpStatus.BAD_REQUEST) {
        if (Array.isArray(res.message)) {
          message = res.message[0];
        }
      }

      // Handle unauthorized errors
      if (res.statusCode === HttpStatus.UNAUTHORIZED) {
        message = 'Unauthorized access. Please provide valid credentials.';
      }

      // Handle forbidden errors
      if (res.statusCode === HttpStatus.FORBIDDEN) {
        message = 'Access forbidden. You do not have permission to perform this action.';
      }

      // Handle not found errors
      if (res.statusCode === HttpStatus.NOT_FOUND) {
        message = 'Resource not found.';
      }
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    }

    // Log error
    this.logger.error(
      `HTTP ${status} Error: ${message} - Request ID: ${requestId} - Path: ${request.url}`,
      exception.stack,
    );

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
      requestId,
    };

    response.status(status).json(errorResponse);
  }
}
