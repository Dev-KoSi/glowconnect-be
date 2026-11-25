/**
 * Email delivery. With SMTP_* set, mail goes out through that server (Gmail app
 * password, Brevo, Mailgun, …). Without it, messages are printed to the server
 * console instead, so sign-up still works while you're developing.
 */
const nodemailer = require('nodemailer');
const config = require('../config');

const smtpHost = String(config.smtp.host || '').trim();
const smtpPort = Number(config.smtp.port) || 465;
// Port 465 uses implicit TLS (secure: true); port 587/25 uses STARTTLS (secure: false).
const smtpSecure = smtpPort === 465;
const smtpUser = String(config.smtp.user || '').trim();
const smtpPass = String(config.smtp.pass || '').trim();

const consoleMode = !smtpHost;
/** Messages "sent" in console mode (read by the API tests). */
const outbox = [];
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (consoleMode) {
    outbox.push({ to, subject, text, html, sentAt: new Date() });
    if (outbox.length > 50) outbox.shift();
    if (!config.isTest) {
      console.log(
        `\n[mail] (SMTP not configured, printing instead of sending)\n[mail] To: ${to}\n[mail] Subject: ${subject}\n${text.replace(/^/gm, '[mail] ')}\n`,
      );
    }
    return;
  }
  await getTransporter().sendMail({ from: config.mailFrom, to, subject, text, html });
}

/** Check SMTP credentials at startup so misconfiguration shows up immediately. */
async function verifyMailer() {
  if (consoleMode) return 'console';
  await getTransporter().verify();
  return 'smtp';
}

module.exports = { sendMail, verifyMailer, outbox, isConsoleMode: () => consoleMode };