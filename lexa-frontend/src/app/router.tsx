import { createBrowserRouter, Navigate } from 'react-router';
import AppShell from './layouts/AppShell';
import RouteErrorBoundary from './RouteErrorBoundary';
import OnboardingPage from '../modules/onboarding/OnboardingPage';

export const router = createBrowserRouter([
  { path: '/sign-in', lazy: async () => ({ Component: (await import('../modules/auth/AuthPage')).SignInPage }), errorElement: <RouteErrorBoundary /> },
  { path: '/create-account', lazy: async () => ({ Component: (await import('../modules/auth/SignupPage')).default }), errorElement: <RouteErrorBoundary /> },
  { path: '/verify-email', lazy: async () => ({ Component: (await import('../modules/auth/VerifyEmailPage')).default }), errorElement: <RouteErrorBoundary /> },
  { path: '/accept-invitation', lazy: async () => ({ Component: (await import('../modules/auth/AcceptInvitationPage')).default }), errorElement: <RouteErrorBoundary /> },
  { path: '/first-admin-setup', lazy: async () => ({ Component: (await import('../modules/auth/AuthPage')).FirstAdministratorPage }), errorElement: <RouteErrorBoundary /> },
  { path: '/forgot-password', lazy: async () => ({ Component: (await import('../modules/auth/AuthPage')).ForgotPasswordPage }), errorElement: <RouteErrorBoundary /> },
  { path: '/reset-password', lazy: async () => ({ Component: (await import('../modules/auth/AuthPage')).ResetPasswordPage }), errorElement: <RouteErrorBoundary /> },
  { path: '/inbox', element: <Navigate to="/" replace />, errorElement: <RouteErrorBoundary /> },
  { path: '/onboarding', Component: OnboardingPage, errorElement: <RouteErrorBoundary /> },
  {
    path: '/', Component: AppShell, ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('../modules/dashboard/DashboardPage')).default }) },
      { path: 'intelligence', lazy: async () => ({ Component: (await import('../modules/intelligence/IntelligencePage')).default }) },
      { path: 'reports', lazy: async () => ({ Component: (await import('../modules/reports/AuthoritativeReportsPage')).default }) },
      { path: 'workspace', lazy: async () => ({ Component: (await import('../modules/workspace/WorkspacePage')).default }) },
      { path: 'products', lazy: async () => ({ Component: (await import('../modules/products/ProductsPage')).default }) },
      { path: 'inventory', lazy: async () => ({ Component: (await import('../modules/inventory/InventoryPage')).default }) },
      { path: 'checkout', lazy: async () => ({ Component: (await import('../modules/checkout/CheckoutPage')).default }) },
      { path: 'sales', lazy: async () => ({ Component: (await import('../modules/sales/SalesPage')).default }) },
      { path: 'sales/:saleId', lazy: async () => ({ Component: (await import('../modules/sales/SaleDetailPage')).default }) },
      { path: 'modules', lazy: async () => ({ Component: (await import('../modules/operations/OperationsWorkspacePage')).default }) },
      { path: 'modules/reports', element: <Navigate to="/reports" replace /> },
      { path: 'modules/integrations', element: <Navigate to="/" replace /> },
      { path: 'modules/audit', element: <Navigate to="/" replace /> },
      { path: 'modules/accounting', lazy: async () => ({ Component: (await import('../modules/operations/GeneralLedgerPanel')).default }) },
      { path: 'modules/team', lazy: async () => ({ Component: (await import('../modules/operations/TeamAccessPanel')).default }) },
      { path: 'modules/recurring-invoices', lazy: async () => ({ Component: (await import('../modules/operations/RecurringInvoicesPage')).default }) },
      { path: 'operations', element: <Navigate to="/" replace /> },
      { path: 'modules/finance-operations', lazy: async () => ({ Component: (await import('../modules/operations/FinanceOperationsPanel')).default }) },
      { path: 'modules/tax-documents', lazy: async () => ({ Component: (await import('../modules/operations/TaxDocumentsPage')).default }) },
      { path: 'modules/sales-invoices', lazy: async () => ({ Component: (await import('../modules/operations/AccountsReceivablePanel')).default }) },
      { path: 'modules/purchase-invoices', lazy: async () => ({ Component: (await import('../modules/operations/AccountsPayablePanel')).default }) },
      { path: 'modules/:moduleId', lazy: async () => ({ Component: (await import('../modules/operations/OperationsWorkspacePage')).default }) },
      { path: 'data-operations', lazy: async () => ({ Component: (await import('../modules/operations/ImportExportCentrePage')).default }) },
      { path: 'business-tools', lazy: async () => ({ Component: (await import('../modules/tools/BusinessToolsPage')).default }) },
      { path: 'business-setup', lazy: async () => ({ Component: (await import('../modules/business-setup/BusinessSetupPage')).default }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('../modules/settings/SettingsPage')).default }) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
