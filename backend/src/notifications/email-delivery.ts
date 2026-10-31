import { ServiceUnavailableException } from '@nestjs/common';
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
export async function sendTransactionalEmail(input: { to: string; subject: string; text: string; actionUrl: string; actionLabel: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_NOT_CONFIGURED', message: 'Set RESEND_API_KEY and RESEND_FROM_EMAIL in the API environment.' });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#152033"><p>${escapeHtml(input.text).replace(/\n/g,'<br>')}</p><p><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 18px;background:#163a72;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(input.actionLabel)}</a></p><p style="color:#667085;font-size:12px">If you did not request this message, ignore it.</p></div>` }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_FAILED', message: `Resend rejected the email request (${response.status}).` });
}
