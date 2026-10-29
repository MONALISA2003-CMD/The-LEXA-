// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { ApiConfigurationError, ApiRequestError, buildQueryString, createApiClient } from './apiClient';

const csrfResponse = () => new Response(JSON.stringify({ data: { token: 'test-csrf-token-that-is-long-enough' } }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

describe('LEXA API client', () => {
  it('omits empty query values and encodes the rest', () => {
    expect(buildQueryString({ search: 'milk & bread', page: 2, inactive: false, empty: '', absent: undefined })).toBe('?search=milk+%26+bread&page=2&inactive=false');
  });

  it('fails closed if the API origin is missing', async () => {
    const client = createApiClient({ baseUrl: '', fetchImpl: vi.fn<typeof fetch>() });
    await expect(client.get('/workspaces')).rejects.toBeInstanceOf(ApiConfigurationError);
  });

  it('fetches a CSRF token for writes and sends credentials and idempotency metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'sale-1' } }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });
    await expect(client.post('/sales', { amountMinor: 125 }, 'lexa-test-idempotency-001')).resolves.toEqual({ id: 'sale-1' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1]!;
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe('https://api.example.test/api/v1/sales');
    expect(init?.credentials).toBe('include');
    expect(headers.get('X-CSRF-Token')).toBe('test-csrf-token-that-is-long-enough');
    expect(headers.get('Idempotency-Key')).toBe('lexa-test-idempotency-001');
    expect(JSON.parse(String(init?.body))).toEqual({ amountMinor: 125 });
  });

  it('preserves a binary response rather than consuming it as text', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Blob(['attachment-bytes']), {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    }));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl, csrfProtection: false });
    const result = await client.download('/attachments/file-1');
    expect(await result.text()).toBe('attachment-bytes');
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get('Accept')).toContain('application/octet-stream');
  });

  it('normalizes backend error envelopes and exposes request identifiers', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'VALIDATION_FAILED', message: 'Quantity must be positive', details: { quantity: 0 } },
      requestId: 'req-abc',
    }), { status: 422, headers: { 'content-type': 'application/json' } }));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl, csrfProtection: false });
    try {
      await client.post('/inventory/movements', { quantityDelta: 0 });
      throw new Error('Expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({ status: 422, code: 'VALIDATION_FAILED', requestId: 'req-abc', message: 'Quantity must be positive' });
    }
  });

  it('signals expired sessions to the app shell on protected API calls', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } }), {
      status: 401, headers: { 'content-type': 'application/json' },
    }));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl, csrfProtection: false, onUnauthorized });
    await expect(client.get('/workspaces')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
