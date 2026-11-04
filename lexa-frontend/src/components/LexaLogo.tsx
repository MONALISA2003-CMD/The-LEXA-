import type { ModuleAccentKey } from '../domain/shared/moduleAccents';
import './lexa-logo.css';

/** Adaptive mark uses the approved LX silhouette: the actual artwork is its mask. */
export default function LexaLogo({ accent = 'navy', compact = false, className = '' }: {
  accent?: ModuleAccentKey;
  compact?: boolean;
  className?: string;
}) {
  return <span className={`lexa-identity ${compact ? 'lexa-identity-compact' : ''} ${className}`.trim()} data-module-accent={accent} aria-label="LEXA">
    <span className="lexa-identity-mark" aria-hidden="true" />
    {!compact && <span className="lexa-identity-wordmark" aria-hidden="true">LEXA</span>}
  </span>;
}
