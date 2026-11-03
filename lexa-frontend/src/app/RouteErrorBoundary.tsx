import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { businessErrorMessage, httpBusinessMessage } from '../data/remote/businessMessages';

export default function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? httpBusinessMessage(error.status, error.statusText || '', undefined)
    : businessErrorMessage(error);
  const staleCode = !isRouteErrorResponse(error) && error instanceof Error && /dynamically imported module|failed to fetch module|importing a module script|Loading chunk/i.test(error.message);
  return <main className="error-screen"><div className="error-icon"><AlertTriangle size={24} /></div><div className="eyebrow eyebrow-blue">BUSINESS ACCESS</div><h1>We couldn't open this page.</h1><p>{staleCode ? "LEXA has a newer version. Refresh the page to load the latest business tools." : message}</p>{staleCode && <button type="button" className="button button-primary" onClick={() => window.location.reload()}>Reload the latest LEXA</button>}<Link to="/" className="button button-primary"><ArrowLeft size={16} /> Return to overview</Link><span className="error-footnote">Need help? Contact your business administrator if this continues.</span></main>;
}
