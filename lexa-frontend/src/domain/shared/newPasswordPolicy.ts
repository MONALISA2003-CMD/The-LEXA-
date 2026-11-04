/** Client guidance mirrors backend validation; backend remains authoritative. */
export const NEW_PASSWORD_RULE = 'Exactly 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.';
export const validNewPassword = (value: string): boolean =>
  /^[\x21-\x7E]{8}$/.test(value) && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value);
