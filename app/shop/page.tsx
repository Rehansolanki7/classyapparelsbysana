import type { Metadata } from "next";
import { getAllProducts } from "../../lib/catalog";
import { getManagedCategories } from "../../lib/categories";
import { getStorefrontSettings } from "../../lib/storefront-settings";
import ShopClient from "./shop-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop all",
  description: "Discover the latest boutique drops from Classy Apparels by Sana.",
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ q?: string; bag?: string; category?: string }> }) {
  const params = await searchParams;
  const [catalog, settings, categories] = await Promise.all([getAllProducts(), getStorefrontSettings(), getManagedCategories()]);
  const products = catalog.filter((product) => product.status === "active");
  return <ShopClient key={`${params.category ?? "all"}:${params.q ?? ""}`} products={products} categories={categories} settings={settings} initialQuery={(params.q ?? "").slice(0, 100)} initialCategorySlug={(params.category ?? "").slice(0, 100)} initialBagOpen={params.bag === "open"} />;
}
