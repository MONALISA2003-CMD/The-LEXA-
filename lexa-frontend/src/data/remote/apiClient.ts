import { apiBaseUrl } from './runtimeConfig';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ApiQueryValue = string | number | boolean | null | undefined;
export type ApiQuery = Record<string, ApiQueryValue>;

export class ApiConfigurationError extends Error {
  readonly code = 'API_NOT_CONFIGURED';
  constructor(message = 'The LEXA backend URL is not configured.') {
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
  const nested = root.error && typeof root.error === 'object' ? root.error as Record<string, unknown> : root;
  return {
    ...(typeof nested.message === 'string' ? { message: nested.message } : {}),
    ...(typeof nested.code === 'string' ? { code: nested.code } : {}),
    ...(typeof root.requestId === 'string' ? { requestId: root.requestId } : typeof nested.requestId === 'string' ? { requestId: nested.requestId } : {}),
    ...(nested.details !== undefined ? { details: nested.details } : {}),
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
    if (!unwrapped || typeof unwrapped.token !== 'string' || unwrapped.token.length < 16) throw new ApiRequestError('The backend did not return a valid CSRF token.', { status: 0, code: 'INVALID_CSRF_TOKEN' });
    cachedCsrfToken = unwrapped.token;
    return cachedCsrfToken;
  }

  async function request<T>(path: string, requestOptions: ApiRequestOptions = {}): Promise<T> {
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
        if (response.status === 401) {
          // A rejected session can invalidate the cached CSRF token too; force a fresh token on the next unsafe request.
          cachedCsrfToken = null;
          if (!path.startsWith('/auth/login') && !path.startsWith('/auth/password/')) options.onUnauthorized?.();
        }
        const message = parsed.message ?? (typeof payload === 'string' && payload.trim() ? payload : `LEXA API request failed (${response.status}).`);
        throw new ApiRequestError(message, { status: response.status, code: parsed.code, requestId: parsed.requestId ?? id, details: parsed.details });
      }
      if (unsafe && (path.endsWith('/auth/login') || path.endsWith('/auth/logout') || path.endsWith('/auth/password/reset'))) cachedCsrfToken = null;
      if (requestOptions.responseType === 'blob') return await response.blob() as T;
      return unwrapEnvelope<T>(payload);
    } catch (error) {
      if (error instanceof ApiRequestError || error instanceof ApiConfigurationError) throw error;
      if (controller.signal.aborted) {
        throw new ApiRequestError('The backend request timed out or was cancelled. Check the connection and retry.', { status: 0, code: 'REQUEST_ABORTED', requestId: id });
      }
      throw new ApiRequestError('Could not reach the LEXA backend. Check the API URL, network and server CORS configuration.', { status: 0, code: 'NETWORK_ERROR', requestId: id, details: error instanceof Error ? error.message : undefined });
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
    put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    baseUrl,
  };
}

const normalizedBase = apiBaseUrl
  ? (apiBaseUrl.endsWith('/api/v1') ? apiBaseUrl : `${apiBaseUrl}/api/v1`)
  : '';

export const apiClient = createApiClient({
  baseUrl: normalizedBase,
  onUnauthorized: () => {
    if (typeof window === 'undefined') return;
    const publicAuthRoutes = ['/sign-in', '/forgot-password', '/reset-password', '/onboarding'];
    if (!publicAuthRoutes.includes(window.location.pathname)) window.dispatchEvent(new CustomEvent('lexa:auth-required'));
  },
});

export function isApiUnavailableError(error: unknown): boolean {
  return error instanceof ApiConfigurationError || (error instanceof ApiRequestError && (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504));
}
