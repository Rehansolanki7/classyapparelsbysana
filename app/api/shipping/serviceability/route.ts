import { shippingForDestination } from "../../../../lib/shipping";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const postalCode = url.searchParams.get("postalCode") ?? url.searchParams.get("pincode") ?? "";
  const countryCode = url.searchParams.get("countryCode") ?? "IN";
  const subtotalPaise = Math.max(0, Math.min(10_000_000, Number(url.searchParams.get("subtotalPaise") ?? 0)));
  return Response.json(await shippingForDestination(countryCode, postalCode, subtotalPaise), { headers: { "cache-control": "no-store" } });
}
