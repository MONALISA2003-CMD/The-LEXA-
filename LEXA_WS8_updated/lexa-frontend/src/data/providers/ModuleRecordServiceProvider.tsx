import { createContext, useContext, type ReactNode } from 'react';
import type { ModuleRecordService } from '../contracts/previewData';
import { localModuleRecordService } from '../local/moduleRecords';
import { apiModuleRecordService } from '../remote/apiModuleRecords';
import { isApiProvider } from '../remote/runtimeConfig';

const activeModuleRecordService = isApiProvider ? apiModuleRecordService : localModuleRecordService;
const ModuleRecordServiceContext = createContext<ModuleRecordService>(activeModuleRecordService);

export function ModuleRecordServiceProvider({ children, service = activeModuleRecordService }: { children: ReactNode; service?: ModuleRecordService }) {
  return <ModuleRecordServiceContext.Provider value={service}>{children}</ModuleRecordServiceContext.Provider>;
}

export function useModuleRecordService(): ModuleRecordService { return useContext(ModuleRecordServiceContext); }
