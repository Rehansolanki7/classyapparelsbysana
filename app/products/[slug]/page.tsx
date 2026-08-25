import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getProductBySlug } from "../../../lib/catalog";
import ProductDetail from "./product-detail";

export const dynamic = "force-dynamic";

const origin = process.env.SITE_URL ?? "https://classyapparelsbysana.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "active") return { title: "Product unavailable", robots: { index: false, follow: false }, openGraph: { images: [] }, twitter: { images: [] } };
  const image = product.images[0]?.startsWith("/") ? `${origin}${product.images[0]}` : product.images[0];
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, description: product.description.slice(0, 160), type: "website", url: `${origin}/products/${product.slug}`, images: image ? [{ url: image, alt: product.name }] : [] },
    twitter: { card: "summary_large_image", title: product.name, description: product.description.slice(0, 160), images: image ? [image] : [] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "active") notFound();
  if (slug !== product.slug) redirect(`/products/${product.slug}`);
  const productSchema = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description, image: product.images.map((image) => image.startsWith("/") ? `${origin}${image}` : image), offers: { "@type": "Offer", priceCurrency: "INR", price: product.price, availability: product.variants.some((variant) => variant.active && variant.stock > 0) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${origin}/products/${product.slug}` } };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema).replace(/</g, "\\u003c") }} /><ProductDetail product={product} /></>;
}
