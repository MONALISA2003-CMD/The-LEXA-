import { createBrowserRouter, Navigate } from 'react-router';
import AppShell from './layouts/AppShell';
import RouteErrorBoundary from './RouteErrorBoundary';
import OnboardingPage from '../modules/onboarding/OnboardingPage';

export const router = createBrowserRouter([
  { path: '/sign-in', lazy: async () => ({ Component: (await import('../modules/auth/AuthPage')).SignInPage }), errorElement: <RouteErrorBoundary /> },
  { path: '/create-account', lazy: async () => ({ Component: (await import('../modules/auth/AuthPage')).CreateAccountPage }), errorElement: <RouteErrorBoundary /> },
  { path: '/forgot-password', lazy: async () => ({ Component: (await import('../modules/auth/AuthPage')).ForgotPasswordPage }), errorElement: <RouteErrorBoundary /> },
  { path: '/reset-password', lazy: async () => ({ Component: (await import('../modules/auth/AuthPage')).ResetPasswordPage }), errorElement: <RouteErrorBoundary /> },
  { path: '/inbox', lazy: async () => ({ Component: (await import('../modules/inbox/InboxPage')).default }), errorElement: <RouteErrorBoundary /> },
  { path: '/onboarding', Component: OnboardingPage, errorElement: <RouteErrorBoundary /> },
  {
    path: '/', Component: AppShell, ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('../modules/dashboard/DashboardPage')).default }) },
      { path: 'workspace', lazy: async () => ({ Component: (await import('../modules/workspace/WorkspacePage')).default }) },
      { path: 'products', lazy: async () => ({ Component: (await import('../modules/products/ProductsPage')).default }) },
      { path: 'inventory', lazy: async () => ({ Component: (await import('../modules/inventory/InventoryPage')).default }) },
      { path: 'checkout', lazy: async () => ({ Component: (await import('../modules/checkout/CheckoutPage')).default }) },
      { path: 'sales', lazy: async () => ({ Component: (await import('../modules/sales/SalesPage')).default }) },
      { path: 'sales/:saleId', lazy: async () => ({ Component: (await import('../modules/sales/SaleDetailPage')).default }) },
      { path: 'modules', lazy: async () => ({ Component: (await import('../modules/operations/OperationsWorkspacePage')).default }) },
      { path: 'modules/accounting', lazy: async () => ({ Component: (await import('../modules/operations/GeneralLedgerPage')).default }) },
      { path: 'modules/:moduleId', lazy: async () => ({ Component: (await import('../modules/operations/OperationsWorkspacePage')).default }) },
      { path: 'business-tools', lazy: async () => ({ Component: (await import('../modules/tools/BusinessToolsPage')).default }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('../modules/settings/SettingsPage')).default }) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
