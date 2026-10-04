const nodemailer = require('nodemailer');

function createTransporter() {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, EMAIL_SECURE } = process.env;
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASSWORD) return null;

  const port = Number(EMAIL_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port,
    secure: EMAIL_SECURE ? EMAIL_SECURE === 'true' : port === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

async function sendLoginConfirmation(user) {
  const transporter = createTransporter();
  if (!transporter) return false;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: user.email,
    subject: 'CampusShare sign-in confirmation',
    text: `Hi ${user.name},\n\nYour CampusShare account was just used to sign in. If this was you, no action is needed. If you do not recognize this activity, please change your password.\n\nCampusShare`,
  });
  return true;
}

module.exports = { sendLoginConfirmation };
