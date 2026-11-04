/** New and reset passwords only; existing login credentials remain valid until changed. */
export const PASSWORD_POLICY_MESSAGE = 'Use exactly 8 characters, including an uppercase letter, a lowercase letter, a number and a symbol.';
export function meetsNewPasswordPolicy(value: unknown): value is string {
  return typeof value === 'string' && /^[\x21-\x7E]{8}$/.test(value) &&
    /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value);
}
