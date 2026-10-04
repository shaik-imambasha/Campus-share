const nodemailer = require('nodemailer');

function appOrigin() {
  const configured = process.env.APP_URL || process.env.CLIENT_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
  const url = new URL(configured);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('CampusShare APP_URL must use HTTPS in production.');
  }
  return url.origin;
}

function isEmailConfigured() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) return false;
  try { appOrigin(); return true; } catch { return false; }
}

function createTransporter() {
  if (!isEmailConfigured()) return null;
  const port = Number(process.env.EMAIL_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port,
    secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === 'true' : port === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function actionLink(path, token, challengeId) {
  const url = new URL(path, `${appOrigin()}/`);
  const fragment = new URLSearchParams({ token });
  if (challengeId) fragment.set('challenge', challengeId);
  url.hash = fragment.toString();
  return url.toString();
}

async function sendActionEmail({ to, name, subject, heading, message, buttonLabel, link, safetyNote }) {
  const transporter = createTransporter();
  if (!transporter) throw new Error('Email delivery is not configured.');
  const safeHeading = escapeHtml(heading);
  const safeMessage = escapeHtml(message);
  const safeName = escapeHtml(name || 'there');
  const safeLink = escapeHtml(link);
  const safeButton = escapeHtml(buttonLabel);
  const safeNote = escapeHtml(safetyNote);
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    text: `Hi ${name || 'there'},\n\n${message}\n\n${buttonLabel}: ${link}\n\n${safetyNote}\n\nCampusShare`,
    html: `<!doctype html><html><body style="margin:0;background:#f7f8f4;font-family:Arial,sans-serif;color:#24332a"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e4e9df;border-radius:12px"><p style="font-weight:bold;color:#276b50">CampusShare · Rent &amp; Reuse</p><h1 style="font-size:24px">${safeHeading}</h1><p>Hi ${safeName},</p><p style="line-height:1.6">${safeMessage}</p><p style="margin:28px 0"><a href="${safeLink}" style="display:inline-block;background:#276b50;color:#fff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:bold">${safeButton}</a></p><p style="font-size:13px;color:#657064;line-height:1.5">${safeNote}</p><p style="font-size:12px;color:#7b837a">If the button does not open, copy the link above into your browser. CampusShare will never ask you to share your password.</p></main></body></html>`,
  });
}

function sendLoginApproval(user, token, challengeId) {
  return sendActionEmail({
    to: user.email,
    name: user.name,
    subject: 'CampusShare — Approve Login',
    heading: 'CampusShare Login Approval',
    message: 'Someone is trying to sign in to your CampusShare account. If this was you, approve this login to continue.',
    buttonLabel: 'Approve Login',
    link: actionLink('/auth/approve', token, challengeId),
    safetyNote: 'If you did not try to sign in, do not approve this request. The link expires in 15 minutes.',
  });
}

function sendEmailVerification(user, token, challengeId) {
  return sendActionEmail({
    to: user.email,
    name: user.name,
    subject: 'CampusShare — Verify Your Email',
    heading: 'Verify your CampusShare email',
    message: 'Confirm your email address to activate your CampusShare account and start sharing with your campus.',
    buttonLabel: 'Verify Email',
    link: actionLink('/auth/verify', token, challengeId),
    safetyNote: 'This link expires in 1 hour. If you did not create a CampusShare account, you can ignore this message.',
  });
}

function sendPasswordReset(user, token) {
  return sendActionEmail({
    to: user.email,
    name: user.name,
    subject: 'CampusShare — Reset Password',
    heading: 'Reset your CampusShare password',
    message: 'A password reset was requested for your CampusShare account. Use the link below to choose a new password.',
    buttonLabel: 'Reset Password',
    link: actionLink('/auth/reset', token),
    safetyNote: 'This link expires in 30 minutes. If you did not request a reset, do not use the link; your password will remain unchanged.',
  });
}

module.exports = { isEmailConfigured, sendLoginApproval, sendEmailVerification, sendPasswordReset };
