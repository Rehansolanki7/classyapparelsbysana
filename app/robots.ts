import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SITE_URL ?? "https://classyapparelsbysana.com").replace(/\/$/, "");
  return { rules: { userAgent: "*", allow: ["/"], disallow: ["/admin", "/account", "/login", "/checkout", "/api/"] }, sitemap: `${base}/sitemap.xml` };
}
