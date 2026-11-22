/**
 * Email templates. Email clients ignore stylesheets and CSS variables, so the
 * site's palette (tokens.css) is inlined here as hex values.
 */
const config = require('../config');

const BRAND = '#b0306a';
const INK = '#1f1720';
const MUTED = '#6b5d68';
const SOFT = '#fbe4ef';
const BG = '#fbf7f9';

function codeEmail({ code, purpose, username }) {
  const signup = purpose === 'signup';
  const greeting = username ? `Hi ${username},` : 'Hi,';
  const lead = signup
    ? 'Welcome to GlowConnect! Enter this code to verify your email and finish creating your account:'
    : 'Use this code to sign in to GlowConnect:';
  const minutes = config.otp.ttlMinutes;
  const subject = signup ? `${code} is your GlowConnect verification code` : `${code} is your GlowConnect sign-in code`;

  const text = [
    greeting,
    '',
    lead,
    '',
    `    ${code}`,
    '',
    `The code expires in ${minutes} minutes. If you didn't request it, you can ignore this email.`,
    '',
    `GlowConnect · ${config.appUrl}`,
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:${BG};font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${INK}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #e8dce4;border-radius:12px;padding:32px" cellspacing="0" cellpadding="0">
      <tr><td style="font-size:22px;font-weight:800;letter-spacing:-0.02em">Glow<span style="color:${BRAND}">Connect</span></td></tr>
      <tr><td style="padding-top:24px;font-size:16px">${greeting}</td></tr>
      <tr><td style="padding-top:8px;font-size:16px;line-height:1.5;color:${MUTED}">${lead}</td></tr>
      <tr><td align="center" style="padding:24px 0">
        <div style="display:inline-block;padding:14px 24px;border-radius:12px;background:${SOFT};color:${BRAND};font-size:32px;font-weight:800;letter-spacing:8px">${code}</div>
      </td></tr>
      <tr><td style="font-size:14px;line-height:1.5;color:${MUTED}">The code expires in ${minutes} minutes. If you didn't request it, you can safely ignore this email.</td></tr>
    </table>
    <p style="font-size:12px;color:${MUTED};margin-top:16px">GlowConnect · Beauty, booked in minutes</p>
  </td></tr></table>
</body></html>`;

  return { subject, text, html };
}

module.exports = { codeEmail };
