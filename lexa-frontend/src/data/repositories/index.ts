import { localWorkspaceRepository } from '../local/workspaces';
import { localProductRepository } from '../local/products';
import { localInventoryRepository } from '../local/inventory';
import { localSalesRepository } from '../local/sales';
import { localReportsRepository } from '../local/reports';
import { apiWorkspaceRepository, apiProductRepository, apiInventoryRepository, apiSalesRepository, apiReportsRepository } from '../remote/apiRepositories';
import { isApiProvider } from '../remote/runtimeConfig';
import { moduleReportService } from '../providers/moduleReportService';

/** One explicit data-provider selection for every core screen; API mode never silently falls back to device storage. */
export const workspaces = isApiProvider ? apiWorkspaceRepository : localWorkspaceRepository;
export const products = isApiProvider ? apiProductRepository : localProductRepository;
export const inventory = isApiProvider ? apiInventoryRepository : localInventoryRepository;
export const sales = isApiProvider ? apiSalesRepository : localSalesRepository;
export const reports = isApiProvider ? apiReportsRepository : localReportsRepository;
export const moduleReports = moduleReportService;
