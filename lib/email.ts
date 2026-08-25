import nodemailer from "nodemailer";

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? "true").toLowerCase() !== "false",
    auth: { user, pass },
  };
}

export function mailConfigured() {
  return Boolean(smtpConfig() && process.env.EMAIL_FROM?.trim());
}

export async function sendMail(payload: { to: string; subject: string; html: string; replyTo?: string }) {
  const config = smtpConfig();
  const from = process.env.EMAIL_FROM?.trim();
  if (!config || !from) throw new Error("Email is not configured");
  const transporter = nodemailer.createTransport(config);
  await transporter.sendMail({ from, to: payload.to, subject: payload.subject, html: payload.html, replyTo: payload.replyTo });
}

export async function sendLoginCodeEmail(email: string, code: string, purpose: "sign_in" | "recovery") {
  const label = purpose === "recovery" ? "account recovery" : "sign in";
  await sendMail({
    to: email,
    subject: `${code} is your Classy Apparels ${label} code`,
    html: `<div style="font-family:Arial,sans-serif;color:#223133;max-width:520px"><h1 style="font-family:Georgia,serif;font-weight:400">Your ${label} code</h1><p>Use this one-time code to ${label} to your Classy Apparels account.</p><p style="font-size:32px;letter-spacing:7px;font-weight:700;margin:24px 0">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p></div>`,
  });
}
