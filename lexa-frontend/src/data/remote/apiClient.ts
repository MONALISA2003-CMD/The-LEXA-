import { httpBusinessMessage } from './businessMessages';
import { apiBaseUrl } from './runtimeConfig';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ApiQueryValue = string | number | boolean | null | undefined;
export type ApiQuery = Record<string, ApiQueryValue>;

export class ApiConfigurationError extends Error {
  readonly code = 'API_NOT_CONFIGURED';
  constructor(message = 'LEXA cannot connect to your business account right now. Please contact your administrator.') {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly details: unknown;
  constructor(message: string, options: { status: number; code?: string | undefined; requestId?: string | undefined; details?: unknown }) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  onUnauthorized?: () => void;
  csrfProtection?: boolean;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'method' | 'body' | 'signal'> {
  method?: ApiMethod | undefined;
  body?: unknown;
  query?: ApiQuery | undefined;
  idempotencyKey?: string | undefined;
  formData?: FormData | undefined;
  responseType?: 'json' | 'blob' | undefined;
  signal?: AbortSignal | null | undefined;
}

function requestId(): string {
  try { return crypto.randomUUID(); }
  catch { return `lexa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
}

function errorPayload(payload: unknown): { message?: string; code?: string; requestId?: string; details?: unknown } {
  if (!payload || typeof payload !== 'object') return {};
  const root = payload as Record<string, unknown>;
  const nested = root.error && typeof root.error === 'object' && !Array.isArray(root.error)
    ? root.error as Record<string, unknown> : root;
  // Nest exceptions may return { message: { code, message } }, whereas other
  // endpoints return { error: { code, message } }. Preserve the security code
  // instead of rendering all 403s as business-role permission errors.
  const detail = nested.message && typeof nested.message === 'object' && !Array.isArray(nested.message)
    ? nested.message as Record<string, unknown> : nested;
  const message = typeof detail.message === 'string' ? detail.message
    : typeof nested.message === 'string' ? nested.message : undefined;
  const code = typeof detail.code === 'string' ? detail.code
    : typeof nested.code === 'string' ? nested.code
      : typeof root.code === 'string' ? root.code : undefined;
  return {
    ...(message ? { message } : {}),
    ...(code ? { code } : {}),
    ...(typeof root.requestId === 'string' ? { requestId: root.requestId } : typeof nested.requestId === 'string' ? { requestId: nested.requestId } : {}),
    ...(detail.details !== undefined ? { details: detail.details } : nested.details !== undefined ? { details: nested.details } : {}),
  };
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export function buildQueryString(query?: ApiQuery): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : '';
}

/** Fetch wrapper shared by every repository. No local/mock fallback is performed on API errors. */
export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 25_000;
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
  const csrfProtection = options.csrfProtection ?? true;
  let cachedCsrfToken: string | null = null;

  async function fetchCsrfToken(signal: AbortSignal): Promise<string> {
    if (cachedCsrfToken) return cachedCsrfToken;
    const response = await fetchImpl(`${baseUrl}/auth/csrf`, { method: 'GET', credentials: 'include', redirect: 'follow', signal, headers: { Accept: 'application/json', 'X-Request-Id': requestId() } });
    const text = response.status === 204 ? '' : await response.text();
    let payload: unknown = undefined;
    if (text) { try { payload = JSON.parse(text) as unknown; } catch { payload = text; } }
    if (!response.ok) {
      const parsed = errorPayload(payload);
      throw new ApiRequestError(parsed.message ?? `Could not obtain a CSRF token (${response.status}).`, { status: response.status, code: parsed.code ?? 'CSRF_TOKEN_FAILED', requestId: parsed.requestId, details: parsed.details });
    }
    const unwrapped = unwrapEnvelope<{ token?: unknown }>(payload);
    if (!unwrapped || typeof unwrapped.token !== 'string' || unwrapped.token.length < 16) throw new ApiRequestError('We could not verify this request. Please refresh and try again.', { status: 0, code: 'INVALID_CSRF_TOKEN' });
    cachedCsrfToken = unwrapped.token;
    return cachedCsrfToken;
  }

  async function request<T>(path: string, requestOptions: ApiRequestOptions = {}, csrfRetried = false): Promise<T> {
    if (!baseUrl) throw new ApiConfigurationError();
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('API paths must be absolute paths within the configured API base.');
    const method = requestOptions.method ?? 'GET';
    const id = requestId();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
    const callerSignal = requestOptions.signal;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

    const headers = new Headers(requestOptions.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    headers.set('X-Request-Id', id);
    if (requestOptions.body !== undefined && !requestOptions.formData) headers.set('Content-Type', 'application/json');
    if (requestOptions.idempotencyKey) headers.set('Idempotency-Key', requestOptions.idempotencyKey);

    const url = `${baseUrl}${path}${buildQueryString(requestOptions.query)}`;
    try {
      const unsafe = method !== 'GET';
      if (unsafe && csrfProtection) headers.set('X-CSRF-Token', await fetchCsrfToken(controller.signal));
      const { query: _query, idempotencyKey: _idempotencyKey, formData: requestFormData, responseType: _responseType, body: requestBody, ...fetchOptions } = requestOptions;
      const response = await fetchImpl(url, {
        ...fetchOptions,
        method,
        headers,
        credentials: requestOptions.credentials ?? 'include',
        redirect: 'follow',
        signal: controller.signal,
        ...(requestFormData !== undefined
          ? { body: requestFormData }
          : requestBody !== undefined
            ? { body: JSON.stringify(requestBody) }
            : {}),
      });
      const text = response.status === 204 || (response.ok && requestOptions.responseType === 'blob') ? '' : await response.text();
      let payload: unknown = undefined;
      if (text) {
        try { payload = JSON.parse(text) as unknown; }
        catch { payload = text; }
      }
      if (!response.ok) {
        const parsed = errorPayload(payload);
        if (unsafe && csrfProtection && response.status === 403 && parsed.code === 'CSRF_TOKEN_INVALID' && !csrfRetried) {
          // The guard rejects before controller writes; retry once with a fresh cookie/token pair.
          cachedCsrfToken = null;
          return request<T>(path, requestOptions, true);
        }
        if (response.status === 401) {
          // A rejected session can invalidate the cached CSRF token too; force a fresh token on the next unsafe request.
          cachedCsrfToken = null;
          if (!path.startsWith('/auth/login') && !path.startsWith('/auth/password/') && !path.startsWith('/platform-admin/')) options.onUnauthorized?.();
        }
        const message = httpBusinessMessage(response.status, parsed.message ?? (typeof payload === 'string' ? payload : ''), parsed.code);
        throw new ApiRequestError(message, { status: response.status, code: parsed.code, requestId: parsed.requestId ?? id, details: parsed.details });
      }
      if (unsafe && (path.endsWith('/auth/login') || path.endsWith('/auth/logout') || path.endsWith('/auth/password/reset') || path.endsWith('/auth/password/change'))) cachedCsrfToken = null; // LEXA_AUTH_SECURITY_UI_PATCH:csrf-refresh-v1
      if (requestOptions.responseType === 'blob') return await response.blob() as T;
      return unwrapEnvelope<T>(payload);
    } catch (error) {
      if (error instanceof ApiRequestError || error instanceof ApiConfigurationError) throw error;
      if (controller.signal.aborted) {
        throw new ApiRequestError('The request took too long. Check your connection and try again.', { status: 0, code: 'REQUEST_ABORTED', requestId: id });
      }
      throw new ApiRequestError('LEXA could not connect to your business account. Check your internet connection and try again.', { status: 0, code: 'NETWORK_ERROR', requestId: id, details: error instanceof Error ? error.message : undefined });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  return {
    request,
    clearCsrfToken: () => { cachedCsrfToken = null; },
    get: <T>(path: string, query?: ApiQuery, signal?: AbortSignal) => request<T>(path, { method: 'GET', query, signal }),
    post: <T>(path: string, body?: unknown, idempotencyKey?: string) => request<T>(path, { method: 'POST', body, idempotencyKey }),
    postForm: <T>(path: string, formData: FormData, idempotencyKey?: string) => request<T>(path, { method: 'POST', formData, idempotencyKey }),
    download: (path: string) => request<Blob>(path, { method: 'GET', responseType: 'blob', headers: { Accept: 'application/octet-stream, application/pdf, image/*' } }),
    put: <T>(path: string, body?: unknown, headers?: HeadersInit) => request<T>(path, { method: 'PUT', body, ...(headers !== undefined ? { headers } : {}) }),
    patch: <T>(path: string, body?: unknown, headers?: HeadersInit) => request<T>(path, { method: 'PATCH', body, ...(headers !== undefined ? { headers } : {}) }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    baseUrl,
  };
}


/** LEXA's Vercel build already proxies /api/v1 to the live Render API.
 * Using a fixed absolute production origin on preview/staging creates a
 * cross-site cookie request, which breaks CSRF and administrator sessions on
 * mobile browsers. Prefer the first-party rewrite for the canonical domain.
 */
export function resolveLexaApiBase(configured: string, currentHostname?: string): string {
  const clean = configured.trim().replace(/\/+$/, '');
  if (!clean) return '';
  // Browser requests from the canonical LEXA Vercel domains must use the
  // first-party rewrite, even if an older Vercel environment variable points
  // directly at Render. Cross-site API calls can lose security/CSRF cookies on
  // modern mobile browsers. The Vercel project already defines /api/v1 routes.
  if (['lexaaamaal.com','www.lexaaamaal.com','lexareview.vercel.app'].includes((currentHostname??'').toLowerCase())) return '/api/v1';
  if (/^https:\/\/(?:www\.)?lexaaamaal\.com(?:\/api\/v1)?$/i.test(clean)) return '/api/v1';
  return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
}

const normalizedBase = resolveLexaApiBase(apiBaseUrl, typeof window !== 'undefined' ? window.location.hostname : undefined);

export const apiClient = createApiClient({
  baseUrl: normalizedBase,
  onUnauthorized: () => {
    if (typeof window === 'undefined') return;
    const publicAuthRoutes = ['/sign-in', '/forgot-password', '/reset-password', '/onboarding', '/create-account', '/verify-email', '/accept-invitation', '/first-admin-setup'];
    if (!publicAuthRoutes.includes(window.location.pathname) && !window.location.pathname.startsWith('/platform-admin')) window.dispatchEvent(new CustomEvent('lexa:auth-required'));
  },
});

export function isApiUnavailableError(error: unknown): boolean {
  return error instanceof ApiConfigurationError || (error instanceof ApiRequestError && (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504));
}
