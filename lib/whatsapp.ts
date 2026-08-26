export const WHATSAPP_URL = "https://wa.me/917715910151";

export function whatsappHref(message?: string) {
  return message ? `${WHATSAPP_URL}?text=${encodeURIComponent(message)}` : WHATSAPP_URL;
}
