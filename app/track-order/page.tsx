import type { Metadata } from "next";
import TrackOrderClient from "./track-order-client";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the latest status of your Classy Apparels order.",
  robots: { index: false, follow: false },
};

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const params = await searchParams;
  return <TrackOrderClient initialOrderNumber={(params.order ?? "").slice(0, 32)} />;
}
