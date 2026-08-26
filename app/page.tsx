import Storefront from "./storefront";
import { getAllProducts, getFeaturedProduct } from "../lib/catalog";
import { getStorefrontSettings } from "../lib/storefront-settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [product, products, settings] = await Promise.all([getFeaturedProduct(), getAllProducts(), getStorefrontSettings()]);
  return <Storefront product={product} products={products.filter((item) => item.status === "active")} settings={settings} />;
}
