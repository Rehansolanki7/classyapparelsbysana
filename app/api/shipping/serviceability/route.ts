import { shippingForDestination } from "../../../../lib/shipping";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const postalCode = url.searchParams.get("postalCode") ?? url.searchParams.get("pincode") ?? "";
  const countryCode = url.searchParams.get("countryCode") ?? "IN";
  const cartWeightGrams = Math.max(0, Math.min(50_000, Math.ceil(Number(url.searchParams.get("cartWeightGrams") ?? 0))));
  const state = (url.searchParams.get("state") ?? "").slice(0, 100);
  return Response.json(await shippingForDestination(countryCode, postalCode, { cartWeightGrams, state }), { headers: { "cache-control": "no-store" } });
}
