export function productSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function canonicalProductSlug(name: string, storedSlug: string, id: string) {
  const fromName = productSlug(name);
  if (/^untitled-product-[a-f0-9]{6}$/i.test(storedSlug) && fromName && name.trim().toLowerCase() !== "untitled product") {
    return fromName;
  }
  return storedSlug || fromName || `product-${id.slice(0, 6)}`;
}
