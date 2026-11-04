import type { ModuleAccentKey } from '../domain/shared/moduleAccents';
import './lexa-logo.css';

type LexaLogoProps = {
  accent?: ModuleAccentKey;
  compact?: boolean;
  className?: string;
  onDark?: boolean;
  variant?: 'adaptive' | 'master' | 'monochrome';
};

/** One LEXA identity. All symbols and letterforms derive from the approved LX artwork. */
export default function LexaLogo({ accent = 'navy', compact = false, className = '', onDark = false, variant = 'adaptive' }: LexaLogoProps) {
  const classes = ['lexa-identity', compact ? 'lexa-identity-compact' : '', onDark ? 'lexa-identity-on-dark' : '', `lexa-identity-${variant}`, className].filter(Boolean).join(' ');
  if (variant === 'master') {
    return <span className={classes} data-module-accent={accent} role="img" aria-label="LEXA">
      {compact ? <img className="lexa-identity-symbol" src="/lexa-lx-symbol.png" alt="" /> : <>
        <img className="lexa-identity-master lexa-identity-on-light" src="/lexa-master-lockup.png" alt="" />
        <img className="lexa-identity-master lexa-identity-on-dark-image" src="/lexa-master-lockup-light.png" alt="" />
      </>}
    </span>;
  }
  return <span className={classes} data-module-accent={accent} role="img" aria-label="LEXA">
    <span className="lexa-identity-symbol-wrap" aria-hidden="true">
      <img className="lexa-identity-symbol lexa-identity-on-light" src={variant === 'monochrome' ? '/lexa-lx-symbol.png' : `/lexa-identity/${accent}.png`} alt="" />
      {variant !== 'monochrome' && <img className="lexa-identity-symbol lexa-identity-on-dark-image" src={`/lexa-identity/${accent}-on-dark.png`} alt="" />}
    </span>
    {!compact && <span className="lexa-identity-wordmark-wrap" aria-hidden="true">
      <img className="lexa-identity-wordmark lexa-identity-on-light" src="/lexa-master-wordmark.png" alt="" />
      <img className="lexa-identity-wordmark lexa-identity-on-dark-image" src="/lexa-master-wordmark-light.png" alt="" />
    </span>}
  </span>;
}
