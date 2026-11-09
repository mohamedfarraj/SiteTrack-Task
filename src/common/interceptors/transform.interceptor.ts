import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Wraps every successful response in a stable envelope:
 *
 *   { data: <handler result>, requestId }
 *
 * List endpoints return `{ items, meta }` inside `data`.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = request.headers['x-request-id'] ?? 'unknown';
    return next.handle().pipe(map((data) => ({ data: data ?? null, requestId })));
  }
}
