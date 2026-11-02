import { Injectable, type ExecutionContext, type CallHandler, type NestInterceptor, HttpException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { catchError } from 'rxjs/operators';

@Injectable()
export class SentryExceptionInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(catchError((error: unknown) => {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      if (status >= 500) Sentry.captureException(error);
      throw error;
    }));
  }
}
