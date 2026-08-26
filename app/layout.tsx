import type { Metadata } from "next";
import "./globals.css";
import Analytics from "./analytics";
import WhatsAppFloat from "./components/whatsapp-float";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://classyapparelsbysana.com"),
  title: {
    default: "Classy Apparels by Sana | Thoughtful everyday elegance",
    template: "%s | Classy Apparels by Sana",
  },
  description:
    "Shop curated women's ethnic wear, three-piece suits and limited boutique drops from Classy Apparels by Sana.",
  openGraph: {
    title: "Classy Apparels by Sana",
    description: "Thoughtful everyday elegance, selected by Sana.",
    type: "website",
    locale: "en_IN",
    siteName: "Classy Apparels by Sana",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Classy Apparels by Sana" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Classy Apparels by Sana",
    description: "Thoughtful everyday elegance, selected by Sana.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<WhatsAppFloat /><Analytics /></body>
    </html>
  );
}
