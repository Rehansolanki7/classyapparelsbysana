import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "../../db";
import { wishlistItems } from "../../db/schema";
import { currentUser } from "../../lib/auth";
import { getAllProducts } from "../../lib/catalog";
import BrandLogo from "../components/brand-logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wishlist", robots: { index: false, follow: false } };

export default async function WishlistPage() {
  const user = await currentUser();
  if (!user) redirect("/login?return_to=/wishlist");
  const db = getDb();
  const items = await db.select({ productId: wishlistItems.productId }).from(wishlistItems).where(eq(wishlistItems.userId, user.id));
  const wanted = new Set(items.map((item) => item.productId));
  const products = (await getAllProducts()).filter((product) => wanted.has(product.id));
  return <main className="wishlist-page"><header className="account-header"><Link href="/shop">← Shop</Link><BrandLogo className="checkout-wordmark" priority /><Link href="/account">My account</Link></header><section><p className="kicker">Your favourites</p><h1>Wishlist</h1>{products.length ? <div className="wishlist-grid">{products.map((product) => <article key={product.id}><img src={product.images[0]} alt={product.name} /><div><p>{product.color}</p><h2>{product.name}</h2><Link className="button button-dark" href={`/products/${product.slug}`}>View piece</Link></div></article>)}</div> : <div className="account-empty"><h3>Your wishlist is empty.</h3><p>Save pieces you want to return to later.</p><Link className="button button-dark" href="/shop">Browse the shop</Link></div>}</section></main>;
}
