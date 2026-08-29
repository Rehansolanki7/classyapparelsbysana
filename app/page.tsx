import Storefront from "./storefront";
import { getAllProducts } from "../lib/catalog";
import { getManagedCategories } from "../lib/categories";
import { getStorefrontSettings } from "../lib/storefront-settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [catalog, settings, categories] = await Promise.all([getAllProducts(), getStorefrontSettings(), getManagedCategories()]);
  const products = catalog.filter((item) => item.status === "active");
  const product = products.find((item) => item.id === settings.featuredProductId) ?? products.find((item) => item.featured) ?? products[0];
  if (!product) throw new Error("No active product is configured for the storefront.");
  return <Storefront product={product} products={products} categories={categories} settings={settings} />;
}
