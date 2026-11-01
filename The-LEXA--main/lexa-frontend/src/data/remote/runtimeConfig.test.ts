import { describe, expect, it } from 'vitest';
import { resolveDataProviderMode } from './runtimeConfig';

describe('resolveDataProviderMode', () => {
  it('always uses the API in production, even if local mode was accidentally configured', () => {
    expect(resolveDataProviderMode(true, 'local')).toBe('api');
    expect(resolveDataProviderMode(true, undefined)).toBe('api');
    expect(resolveDataProviderMode(true, 'api')).toBe('api');
  });

  it('allows explicit API mode in development', () => {
    expect(resolveDataProviderMode(false, 'api')).toBe('api');
    expect(resolveDataProviderMode(false, ' API ')).toBe('api');
  });

  it('keeps device-only mode as the development default', () => {
    expect(resolveDataProviderMode(false, 'local')).toBe('local');
    expect(resolveDataProviderMode(false, undefined)).toBe('local');
    expect(resolveDataProviderMode(false, 'unknown')).toBe('local');
  });
});
