import type { Metadata } from "next";
import { getAllProducts } from "../../lib/catalog";
import ShopClient from "./shop-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop all",
  description: "Discover the latest boutique drops from Classy Apparels by Sana.",
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const products = (await getAllProducts()).filter((product) => product.status === "active");
  return <ShopClient products={products} initialQuery={(params.q ?? "").slice(0, 100)} />;
}
