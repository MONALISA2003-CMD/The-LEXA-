export type DataProviderMode = 'api' | 'local';

/**
 * Resolve the provider without allowing a production build to fall back to device-only data.
 * Local storage is a development-only convenience, never a production data source.
 */
export function resolveDataProviderMode(production: boolean, configuredValue: string | undefined): DataProviderMode {
  if (production) return 'api';
  return configuredValue?.trim().toLowerCase() === 'api' ? 'api' : 'local';
}

export const dataProviderMode: DataProviderMode = resolveDataProviderMode(
  import.meta.env.PROD,
  import.meta.env.VITE_DATA_PROVIDER,
);

export const isApiProvider = dataProviderMode === 'api';

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

export function describeDataProvider(): string {
  if (dataProviderMode === 'local') return 'Development-only device storage — records stay in this browser and do not sync across devices.';
  if (!apiBaseUrl) return 'The business service is not connected. Please contact your administrator.';
  return 'Your business information is connected to your LEXA account.';
}
