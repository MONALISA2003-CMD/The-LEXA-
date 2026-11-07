export type DataProviderMode = 'api' | 'local';

/**
 * Resolve the provider without allowing a production build to fall back to device-only data.
 * Local storage is a development-only convenience, never a production data source.
 */
export function resolveDataProviderMode(production: boolean, configuredValue: string | undefined, isolatedBrowserDemo = false): DataProviderMode {
  if (isolatedBrowserDemo) return 'local';
  if (production) return 'api';
  return configuredValue?.trim().toLowerCase() === 'api' ? 'api' : 'local';
}

/** Compile-time-only switch. It is false in every real customer build.
 * Both the opt-in and the /demo/ Vite base are required, preventing accidental
 * production local-mode activation through a query parameter or storage key. */
export const isBrowserDemoBuild = import.meta.env.VITE_LEXA_BROWSER_DEMO === 'true'
  && import.meta.env.BASE_URL.startsWith('/demo/');
export const dataProviderMode: DataProviderMode = resolveDataProviderMode(
  import.meta.env.PROD,
  import.meta.env.VITE_DATA_PROVIDER,
  isBrowserDemoBuild,
);

export const isApiProvider = dataProviderMode === 'api';

export const apiBaseUrl = isBrowserDemoBuild ? '' : (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

export function describeDataProvider(): string {
  if (isBrowserDemoBuild) return 'Fictional demonstration records stay in this browser only. They are not sent to LEXA customer services.';
  if (dataProviderMode === 'local') return 'Development-only device storage — records stay in this browser and do not sync across devices.';
  if (!apiBaseUrl) return 'The business service is not connected. Please contact your administrator.';
  return 'Your business information is connected to your LEXA account.';
}
