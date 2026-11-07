import { sendTransactionalEmail } from '../notifications/email-delivery';
import { subscriptionConfirmationContent } from './subscription-confirmation-content';

/** A payment confirmation is not an authentication credential or an entitlement bypass.
 * Signup already verified the recipient's email; the payment itself is activated
 * by the audited administrator decision. The owner must sign in to use LEXA.
 */
export async function sendSubscriptionAccessEmail(input: {
  recipientEmail:string;businessName:string;paidThrough:Date;claimId:string;
}):Promise<void> {
  const content=subscriptionConfirmationContent(input);
  await sendTransactionalEmail({
    to: input.recipientEmail, ...content,
    idempotencyKey: `lexa-subscription-approved-${input.claimId}`,
  });
}
