import { createContext, useContext, type ReactNode } from 'react';
import type { PreviewDataService } from '../contracts/previewData';
import { previewDataService } from '../mock/previewDataService';

const PreviewDataServiceContext = createContext<PreviewDataService>(previewDataService);

/**
 * Injectable module-record data boundary. The current adapter stores records in this browser;
 * a backend adapter can be supplied without changing module screens.
 */
export function PreviewDataServiceProvider({
  children,
  service = previewDataService,
}: {
  children: ReactNode;
  service?: PreviewDataService;
}) {
  return <PreviewDataServiceContext.Provider value={service}>{children}</PreviewDataServiceContext.Provider>;
}

export function usePreviewDataService(): PreviewDataService {
  return useContext(PreviewDataServiceContext);
}
