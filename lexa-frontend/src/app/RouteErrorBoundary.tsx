import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { businessErrorMessage, httpBusinessMessage } from '../data/remote/businessMessages';

export default function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? httpBusinessMessage(error.status, error.statusText || '', undefined)
    : businessErrorMessage(error);
  return <main className="error-screen"><div className="error-icon"><AlertTriangle size={24} /></div><div className="eyebrow eyebrow-blue">BUSINESS ACCESS</div><h1>We couldn't open this page.</h1><p>{message}</p><Link to="/" className="button button-primary"><ArrowLeft size={16} /> Return to overview</Link><span className="error-footnote">Need help? Contact your business administrator if this continues.</span></main>;
}
