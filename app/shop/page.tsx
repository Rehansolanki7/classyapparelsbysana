import type { Metadata } from "next";
import { getAllProducts } from "../../lib/catalog";
import { getStorefrontSettings } from "../../lib/storefront-settings";
import ShopClient from "./shop-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop all",
  description: "Discover the latest boutique drops from Classy Apparels by Sana.",
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const [catalog, settings] = await Promise.all([getAllProducts(), getStorefrontSettings()]);
  const products = catalog.filter((product) => product.status === "active");
  return <ShopClient products={products} settings={settings} initialQuery={(params.q ?? "").slice(0, 100)} />;
}
