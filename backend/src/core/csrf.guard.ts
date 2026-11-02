import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const item of (header ?? '').split(';')) {
    const index = item.indexOf('=');
    if (index < 0) continue;
    const key = item.slice(0, index).trim();
    if (key === name) {
      try { return decodeURIComponent(item.slice(index + 1).trim()); }
      catch { return undefined; }
    }
  }
  return undefined;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const cookie = readCookie(request.headers.cookie, 'lexa_csrf');
    const header = request.headers['x-csrf-token'];
    const headerValue = Array.isArray(header) ? header[0] : header;
    if (!cookie || !headerValue || cookie.length < 32 || cookie !== headerValue) {
      throw new ForbiddenException({ code: 'CSRF_TOKEN_INVALID', message: 'Refresh the page and retry the request.' });
    }
    return true;
  }
}
