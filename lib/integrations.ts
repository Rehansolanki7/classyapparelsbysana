import { mailConfigured } from "./email";

export function notificationConfiguration() {
  const configured = process.env.ORDER_NOTIFICATION_EMAIL ?? process.env.OWNER_EMAIL ?? "shop@classyapparelsbysana.com";
  const adminEmail = configured
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .join(", ");
  return { adminEmail, fromEmail: process.env.EMAIL_FROM?.trim() ?? "" };
}

export function orderNotificationsConfigured() {
  return mailConfigured() && Boolean(notificationConfiguration().adminEmail);
}
