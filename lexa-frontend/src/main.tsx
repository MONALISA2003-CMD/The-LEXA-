import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from './app/providers';
import { router } from './app/router';
import './styles/index.css';
import './styles/phase-two.css';
import './styles/lexa-brand.css';
import './styles/lexa-ceo.css';
import './styles/backend-status.css';
import './styles/auth.css'; // LEXA_AUTH_SECURITY_UI_PATCH:auth-css-v1
import './styles/module-graph.css';
import './styles/business-setup.css';
import './styles/lexa-executive-premium.css';
import './styles/lexa-release-navigation.css';
import './styles/auth-glass-electric.css';

// A device can retain an old HTML shell after an update while Vite chunk names change.
// Refresh once on a missing chunk, then let the route error boundary show a retry
// rather than entering an infinite reload loop.
window.addEventListener('vite:preloadError', (event: Event) => {
  const retryKey = `lexa:chunk-refresh:${window.location.pathname}`;
  try {
    if (window.sessionStorage.getItem(retryKey) === 'attempted') return;
    window.sessionStorage.setItem(retryKey, 'attempted');
    event.preventDefault();
    window.location.reload();
  } catch { /* A blocked storage API must never break rendering. */ }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
