/** Payment approval requires a real provider reference and independent checks.
 * The request's LXA- reference is only for finding the claim, never proof of receipt.
 */
export interface PaymentReviewInput {
  providerReference: string;
  internalReference: string;
  verificationNote: string;
  independentlyConfirmed: boolean;
  amountUGX: number;
}
export function paymentReviewRequirements(input: PaymentReviewInput): string[] {
  const missing: string[] = [];
  if (input.amountUGX !== 50_000) missing.push('The claimed amount must match UGX 50,000.');
  const reference = input.providerReference.trim().toUpperCase().replace(/\s+/g, ' ');
  if (reference.length < 6 || reference === input.internalReference.trim().toUpperCase()
     || reference.startsWith('LXA-')
     || /^(?:OK|PAID|CONFIRMED|VERIFIED|NONE|N\/?A|RECEIVED|SUCCESS)(?:[ ._-].*)?$/.test(reference))
    missing.push('Enter the actual bank or mobile-money provider transaction reference (at least 6 characters).');
  if (input.verificationNote.trim().length < 12)
    missing.push('Explain which receiving account, amount and transfer you checked (at least 12 characters).');
  if (!input.independentlyConfirmed)
    missing.push('Confirm that UGX 50,000 arrived in the official receiving account.');
  return missing;
}
