import { localSalesWorkflow } from '../local/sales-workflow';
import { apiSalesWorkflow } from '../remote/apiSalesWorkflow';
import { isApiProvider } from '../remote/runtimeConfig';

/** The same sales workflow contract routes to an atomic server operation in API mode. */
export const salesWorkflow = isApiProvider ? apiSalesWorkflow : localSalesWorkflow;
