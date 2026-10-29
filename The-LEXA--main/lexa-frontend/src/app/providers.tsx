import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { PreviewDataServiceProvider } from '../data/providers/PreviewDataServiceProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <PreviewDataServiceProvider>
        {children}
      </PreviewDataServiceProvider>
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
