import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import CheckoutClient, { type CheckoutSelection } from "./checkout-client";
import { getDb } from "../../db";
import { addresses } from "../../db/schema";
import { getAllProducts } from "../../lib/catalog";
import { currentUser } from "../../lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Secure checkout",
  description: "Complete your Classy Apparels order securely.",
  robots: { index: false, follow: false },
};

function requestedCart(value: string | undefined): CheckoutSelection[] {
  if (!value || value.length > 5000) return [];
  try {
    const parsed = JSON.parse(value) as Array<{ productId?: unknown; size?: unknown; quantity?: unknown }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 10).flatMap((item) => {
      if (typeof item.productId !== "string" || typeof item.size !== "string") return [];
      const quantity = Math.max(1, Math.min(5, Math.floor(Number(item.quantity) || 1)));
      return [{ productId: item.productId.slice(0, 100), size: item.size.slice(0, 20), quantity }];
    });
  } catch {
    return [];
  }
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; size?: string; qty?: string; cart?: string }>;
}) {
  const params = await searchParams;
  const [catalog, user] = await Promise.all([getAllProducts(), currentUser()]);
  const products = catalog.filter((product) => product.status === "active");
  let savedAddresses: Array<{ id: string; label: string; recipientName: string; phone: string; addressLine1: string; addressLine2: string; city: string; state: string; countryCode: string; postalCode: string; isDefault: boolean }> = [];
  if (user && !user.adminAuthenticated) {
    try {
      savedAddresses = await getDb().select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
    } catch {
      // Checkout remains available if the optional address-book migration has
      // not reached a deployment yet.
    }
  }
  const selections: CheckoutSelection[] = [];

  for (const request of requestedCart(params.cart)) {
    const product = products.find((item) => item.id === request.productId);
    const variant = product?.variants.find((item) => item.active && item.stock > 0 && item.size === request.size);
    if (!product || !variant) continue;
    selections.push({ productId: product.id, size: variant.size, quantity: Math.min(request.quantity, variant.stock, 5) });
  }

  if (!selections.length && products.length) {
    const product = products.find((item) => item.id === params.product) ?? products[0];
    const available = product.variants.filter((variant) => variant.active && variant.stock > 0);
    const variant = available.find((item) => item.size === params.size) ?? available[0];
    if (variant) {
      const requestedQuantity = Math.max(1, Math.min(5, Number.parseInt(params.qty ?? "1", 10) || 1));
      selections.push({ productId: product.id, size: variant.size, quantity: Math.min(requestedQuantity, variant.stock) });
    }
  }

  const initialCustomer = user && !user.adminAuthenticated ? { name: user.name, email: user.email } : undefined;
  if (!initialCustomer) {
    const query = new URLSearchParams();
    if (params.cart) query.set("cart", params.cart);
    if (params.product) query.set("product", params.product);
    if (params.size) query.set("size", params.size);
    if (params.qty) query.set("qty", params.qty);
    const returnTo = `/checkout${query.size ? `?${query.toString()}` : ""}`;
    return <main className="checkout-shell checkout-success">
      <Link className="checkout-wordmark" href="/"><span>Classy Apparels</span></Link>
      <p className="kicker">Secure checkout</p>
      <h1>Sign in before adding a delivery address.</h1>
      <p>Create an account if you are new. This keeps your address, order history and payment confirmation safely linked to you.</p>
      <div className="checkout-success-actions">
        <Link className="button button-dark" href={`/login?return_to=${encodeURIComponent(returnTo)}`}>Sign in</Link>
        <Link className="text-link" href={`/login?mode=signup&return_to=${encodeURIComponent(returnTo)}`}>Create an account</Link>
        <Link className="text-link" href="/shop">Return to shop</Link>
      </div>
    </main>;
  }
  return <CheckoutClient products={products} initialItems={selections} initialCustomer={initialCustomer} savedAddresses={savedAddresses} />;
}
