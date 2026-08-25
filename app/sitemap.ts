import type { MetadataRoute } from "next";
import { getAllProducts } from "../lib/catalog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL ?? "https://classyapparelsbysana.com").replace(/\/$/, "");
  const products = await getAllProducts();
  return [{ url: base, changeFrequency: "weekly", priority: 1 }, { url: `${base}/shop`, changeFrequency: "daily", priority: 0.9 }, ...products.filter((product) => product.status === "active").map((product) => ({ url: `${base}/products/${product.slug}`, changeFrequency: "weekly" as const, priority: 0.8 }))];
}
