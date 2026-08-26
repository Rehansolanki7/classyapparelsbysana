"use client";

import { usePathname } from "next/navigation";
import { whatsappHref } from "../../lib/whatsapp";

export default function WhatsAppFloat({ message }: { message?: string } = {}) {
  const pathname = usePathname();

  // Keep the payment experience focused on the secure checkout flow.
  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) return null;
  // Owner tools should stay free of customer-facing overlays and accidental
  // external-navigation shortcuts while fulfilment work is in progress.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  // Product, shop and home pages provide a more useful contextual draft.
  if (!message && (pathname === "/" || pathname === "/shop" || pathname.startsWith("/products/"))) return null;

  const draft = message || "Hi Sana, I found your website and would love help choosing an outfit.";

  return (
    <a className="whatsapp-float" href={whatsappHref(draft)} target="_blank" rel="noreferrer" aria-label="Chat with Sana on WhatsApp" title="Chat with Sana on WhatsApp">
      <svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M27.2 4.7A15.5 15.5 0 0 0 2.8 23.4L.6 31.5l8.3-2.2a15.5 15.5 0 0 0 7.4 1.9h.1A15.5 15.5 0 0 0 27.2 4.7Zm-10.8 24a12.9 12.9 0 0 1-6.6-1.8l-.5-.3-4.9 1.3 1.3-4.8-.3-.5a13 13 0 1 1 11 6.1Zm7.1-9.7c-.4-.2-2.3-1.1-2.7-1.3-.4-.1-.6-.2-.9.2-.3.4-1 1.3-1.3 1.6-.2.3-.5.3-.9.1-2.3-1.1-3.8-2-5.3-4.6-.4-.7.4-.7 1.1-2.2.1-.3 0-.5-.1-.7l-1.2-2.9c-.3-.8-.7-.7-.9-.7h-.8c-.3 0-.7.1-1.1.5-.4.4-1.4 1.4-1.4 3.4s1.5 4 1.7 4.3c.2.3 2.9 4.4 7 6.2 2.6 1.1 3.6 1.2 4.9 1 1.5-.2 2.3-1.1 2.6-2.1.3-1 .3-1.9.2-2.1-.1-.2-.4-.3-.8-.5Z" /></svg>
    </a>
  );
}
