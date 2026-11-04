/** Transactional onboarding email sent after a verified account has been committed. */
import { sendTransactionalEmail } from './email-delivery';

export const LEXA_SUPPORT_WHATSAPP = 'https://wa.me/256749064282';
export const LEXA_SUPPORT_PHONE = '+256200912134';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const services = [
  ['Sales and customers', 'Organize customers, quotations, orders, checkout, receipts and sales performance.'],
  ['Products and inventory', 'Manage product catalogues, barcodes, stock movement, warehouses and branch inventory.'],
  ['Purchasing and suppliers', 'Coordinate purchase requests, quotations, orders, goods receiving and supplier records.'],
  ['Finance and accounting', 'Track invoices, expenses, payments, general ledger, tax records and bank reconciliation.'],
  ['People and operations', 'Support employee records, attendance, leave, payroll, permissions and daily workflows.'],
  ['Projects and production', 'Manage projects, tasks, manufacturing workflows and quality checks where enabled.'],
  ['Dashboards and reporting', 'Follow operational results, financial activity, business insights and audit history.'],
  ['Teamwork and administration', 'Invite team members, assign roles and branches, and work within your own private business.'],
] as const;

export function buildLexaWelcomeEmail(input: {
  displayName: string;
  businessName: string;
  owner: boolean;
  baseUrl: string;
}): { text: string; html: string; actionUrl: string } {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(baseUrl)) throw new Error('LEXA public URL must be a secure origin.');
  const actionUrl = `${baseUrl}/workspace`;
  const accessMessage = input.owner
    ? `As the owner of ${input.businessName}, you have full administrative access to your own business and its branches. Your information is separated from other LEXA businesses.`
    : `You are joining ${input.businessName}. Your business administrator controls which tools, records and branches you can access.`;
  const introduction = `Hello ${input.displayName},\n\nWelcome to LEXA! Your account is ready.\n\n${accessMessage}`;
  const summary = services.map(([name, description]) => `${name}: ${description}`).join('\n');
  const footer = `\nAvailable features depend on your business configuration and access permissions.\n\nOpen your workspace: ${actionUrl}\nWhatsApp support: ${LEXA_SUPPORT_WHATSAPP}\nCall support: ${LEXA_SUPPORT_PHONE}\n\nFor your security, never share passwords or one-time verification links.\n\nWelcome aboard,\nThe LEXA Team\nLEXA is a subsidiary of AMAAL GROUP.`;
  const text = `${introduction}\n\nWhat you can do with LEXA:\n${summary}\n${footer}`;
  const serviceCards = services.map(([name, description]) => `<tr><td style="padding:12px 16px;border-bottom:1px solid #e9edf5;vertical-align:top"><strong style="color:#16355d">${escapeHtml(name)}</strong><p style="margin:5px 0 0;color:#475569;font-size:14px;line-height:1.5">${escapeHtml(description)}</p></td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f3f7fc;font-family:Arial,Helvetica,sans-serif;color:#11284a"><div style="max-width:640px;margin:0 auto;background:white;border:1px solid #e0e9f5;border-radius:18px;overflow:hidden"><div style="background:#082b59;padding:28px 32px;color:white"><img src="https://lexaaamaal.com/lexa-master-lockup-light.png" alt="LEXA" width="238" height="65" style="display:block;width:238px;max-width:100%;height:auto;object-fit:contain;border:0"><div style="font-size:12px;color:#b8d7ff;letter-spacing:1.5px;margin-top:8px">YOUR BUSINESS. ONE PLACE.</div><h1 style="font-size:29px;line-height:1.2;margin:22px 0 8px;color:#fff">Welcome to LEXA!</h1><p style="margin:0;color:#e0eeff;font-size:15px">A smarter home for the work that keeps your business moving.</p></div><div style="padding:26px 30px"><p style="font-size:16px">Hello <strong>${escapeHtml(input.displayName)}</strong>,</p><p>Your account is ready. We're delighted to welcome you to LEXA.</p><p style="line-height:1.65">${escapeHtml(accessMessage)}</p><p style="margin-top:24px;font-weight:700;font-size:18px">Discover what LEXA brings together</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e9edf5;border-radius:12px">${serviceCards}</table><p style="font-size:13px;color:#64748b;line-height:1.6;margin-top:18px">Features depend on your business configuration and assigned permissions.</p><p style="text-align:center;margin:30px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#1066e6;color:#fff;text-decoration:none;font-weight:bold;padding:15px 28px;border-radius:10px">Open my LEXA workspace</a></p><div style="border-top:1px solid #e2e8f0;padding-top:22px"><h2 style="font-size:18px;margin:0 0 10px">Need help? We're here.</h2><p style="margin:5px 0">WhatsApp: <a href="${LEXA_SUPPORT_WHATSAPP}" style="color:#1066e6">+256 749 064282</a></p><p style="margin:5px 0">Call us: <a href="tel:${LEXA_SUPPORT_PHONE}" style="color:#1066e6">+256 200 912134</a></p></div><p style="font-size:12px;color:#64748b;line-height:1.6;margin-top:26px">Keep your password and verification links private. We will never ask you to share them over WhatsApp or phone.</p><p>Welcome aboard,<br><strong>The LEXA Team</strong></p><p style="font-size:12px;color:#64748b">LEXA is a subsidiary of AMAAL GROUP.</p></div></div></body></html>`;
  return { text, html, actionUrl };
}

export async function sendLexaWelcomeEmail(input: {
  userId: string;
  recipientEmail: string;
  displayName: string;
  businessName: string;
  owner: boolean;
}): Promise<void> {
  const baseUrl = process.env.FRONTEND_PUBLIC_URL || 'https://lexaaamaal.com';
  const content = buildLexaWelcomeEmail({ ...input, baseUrl });
  await sendTransactionalEmail({
    to: input.recipientEmail,
    subject: `Welcome to LEXA — ${input.businessName}`,
    text: content.text,
    html: content.html,
    actionUrl: content.actionUrl,
    actionLabel: 'Open my LEXA workspace',
    idempotencyKey: `lexa-welcome-${input.userId}`,
  });
}
