/** Customer payment confirmation: a sign-in invitation, never a bearer login token. */
export function subscriptionConfirmationContent(input: {businessName:string;paidThrough:Date}): {subject:string;text:string;actionUrl:string;actionLabel:string} {
  const expiry = input.paidThrough.toLocaleString('en-UG', {dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Kampala'});
  return {
    subject: 'LEXA payment confirmed — your business access is ready',
    text: `Your subscription payment of UGX 50,000 for ${input.businessName} has been independently verified by LEXA.\n\nYour 30-day subscription is now active and paid through ${expiry} (East Africa Time).\n\nOpen the link below and sign in with your existing verified business email and password to access your business. Never share your password or sign-in code.\n\nIf you did not expect this payment notification, contact LEXA support through the official website.`,
    // Main domain serves the current app; this link never automatically signs in or approves a payment.
    actionUrl: 'https://lexaaamaal.com/sign-in?subscription=active',
    actionLabel: 'Open my activated business',
  };
}

