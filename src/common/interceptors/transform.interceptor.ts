import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    const requestId = request.headers['x-request-id'] || 'unknown';

    return next.handle().pipe(
      map((data) => {
        // Transform the response data here
        return {
          data,
          statusCode: response.statusCode,
          timestamp: new Date().toISOString(),
          requestId,
        };
      }),
    );
  }
}
