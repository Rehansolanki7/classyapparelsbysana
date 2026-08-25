import Storefront from "./storefront";
import { getAllProducts, getFeaturedProduct } from "../lib/catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [product, products] = await Promise.all([getFeaturedProduct(), getAllProducts()]);
  return <Storefront product={product} products={products.filter((item) => item.status === "active")} />;
}
