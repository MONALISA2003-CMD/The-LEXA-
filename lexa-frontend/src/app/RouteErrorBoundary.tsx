import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export default function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText || 'Navigation error'}`
    : error instanceof Error ? error.message : 'An unexpected application error occurred.';
  return <main className="error-screen"><div className="error-icon"><AlertTriangle size={24} /></div><div className="eyebrow eyebrow-blue">WORKSPACE ERROR</div><h1>This page could not be opened.</h1><p>{message}</p><Link to="/" className="button button-primary"><ArrowLeft size={16} /> Return to overview</Link><span className="error-footnote">Your saved local records have not been intentionally deleted.</span></main>;
}
