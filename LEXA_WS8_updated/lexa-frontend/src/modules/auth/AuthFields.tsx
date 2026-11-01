import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder = 'Enter your password',
  required = true,
  disabled = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <div className="auth-input-wrap auth-password-wrap">
        <LockKeyhole size={17} aria-hidden="true" />
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          maxLength={1024}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button
          className="auth-password-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
}

export function PasswordLengthGuide({ value }: { value: string }) {
  const length = Array.from(value).length;
  const progress = Math.min(100, Math.round((length / 15) * 100));
  const ready = length >= 15;
  return (
    <div className="auth-password-guide" aria-live="polite">
      <div className="auth-password-guide-head">
        <span>{ready ? 'Length requirement met' : 'Use at least 15 characters'}</span>
        <strong>{length}/15</strong>
      </div>
      <div className="auth-password-track" role="progressbar" aria-label="Password length guidance" aria-valuemin={0} aria-valuemax={15} aria-valuenow={Math.min(length, 15)}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <p>A memorable, unique passphrase works well. Spaces and any characters are allowed; no symbol-mix rule is required.</p>
    </div>
  );
}
