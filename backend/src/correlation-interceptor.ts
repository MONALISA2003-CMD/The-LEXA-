import { Injectable, type ExecutionContext, type CallHandler, type NestInterceptor } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { correlationIdFromHeader, runWithCorrelationId } from './request-correlation';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const correlationId = correlationIdFromHeader(request.headers['x-request-id']);
    (request as FastifyRequest & { correlationId?: string }).correlationId = correlationId;
    const response = context.switchToHttp().getResponse<{ header?: (name: string, value: string) => void }>();
    response.header?.('X-Request-ID', correlationId);
    return new Observable((subscriber) => runWithCorrelationId(correlationId, () => next.handle().subscribe(subscriber)));
  }
}
