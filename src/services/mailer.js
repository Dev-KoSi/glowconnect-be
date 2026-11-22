/**
 * Email delivery. With SMTP_* set, mail goes out through that server (Gmail app
 * password, Brevo, Mailgun, …). Without it, messages are printed to the server
 * console instead, so sign-up still works while you're developing.
 */
const nodemailer = require('nodemailer');
const config = require('../config');

const consoleMode = !config.smtp.host;
/** Messages "sent" in console mode (read by the API tests). */
const outbox = [];
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (consoleMode) {
    outbox.push({ to, subject, text, html, sentAt: new Date() });
    if (outbox.length > 50) outbox.shift();
    if (!config.isTest) {
      console.log(`\n[mail] (SMTP not configured, printing instead of sending)\n[mail] To: ${to}\n[mail] Subject: ${subject}\n${text.replace(/^/gm, '[mail] ')}\n`);
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
