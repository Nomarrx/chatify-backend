/**
 * File: utils/mailer.js
 * Description: Nodemailer transporter + OTP email sender
 */

const nodemailer = require("nodemailer");

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  if (!user || !pass || !host || !port) {
    throw new Error(
      "SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS env vars are missing."
    );
  }
  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure: false,
    auth: { user, pass },
  });
  return _transporter;
}

async function sendOtpEmail(to, otp) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const html = `
    <div style="font-family:'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f7f7fb;border-radius:16px;color:#1a1a2e;">
      <h2 style="margin:0 0 8px;color:#2444EB;">Verify your Chatify account</h2>
      <p style="margin:0 0 20px;color:#555;font-size:14px;">
        Use the code below to finish signing up. It expires in 10 minutes.
      </p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;background:white;padding:18px;border-radius:12px;color:#2444EB;">
        ${otp}
      </div>
      <p style="margin:20px 0 0;color:#888;font-size:12px;">
        Didn't request this? You can safely ignore this email.
      </p>
    </div>
  `;
  await getTransporter().sendMail({
    from,
    to,
    subject: `Your Chatify verification code: ${otp}`,
    text: `Your Chatify verification code is ${otp}. It expires in 10 minutes.`,
    html,
  });
}

module.exports = { sendOtpEmail };
