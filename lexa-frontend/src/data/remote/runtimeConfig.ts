export type DataProviderMode = 'api' | 'local';

const configuredMode = import.meta.env.VITE_DATA_PROVIDER?.trim().toLowerCase();

/** Production defaults to the API provider; browser-local persistence must be an explicit choice. */
export const dataProviderMode: DataProviderMode = configuredMode === 'local'
  ? 'local'
  : configuredMode === 'api' || import.meta.env.PROD
    ? 'api'
    : 'local';

export const isApiProvider = dataProviderMode === 'api';

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

export function describeDataProvider(): string {
  if (dataProviderMode === 'local') return 'Device storage mode — records stay in this browser and do not sync across devices.';
  if (!apiBaseUrl) return 'Backend API is not configured. Set VITE_API_BASE_URL in the deployment environment.';
  return 'API mode selected. Backend availability is verified by actual API requests.';
}
