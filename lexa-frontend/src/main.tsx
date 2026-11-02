import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from './app/providers';
import { router } from './app/router';
import './styles/index.css';
import './styles/module-workspaces.css';
import './styles/lexa-brand.css';
import './styles/backend-status.css';
import './styles/auth.css'; // LEXA_AUTH_SECURITY_UI_PATCH:auth-css-v1
import './styles/module-graph.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
