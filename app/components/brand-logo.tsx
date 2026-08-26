"use client";

import Image from "next/image";
import Link from "next/link";

type BrandLogoVariant = "wide" | "stacked" | "mark";

const assets: Record<BrandLogoVariant, { src: string; width: number; height: number }> = {
  wide: { src: "/branding/classy-apparels-logo-wide.png", width: 2172, height: 724 },
  stacked: { src: "/branding/classy-apparels-logo-stacked.png", width: 1254, height: 1254 },
  mark: { src: "/branding/classy-apparels-ca-mark.png", width: 1254, height: 1254 },
};

/** A single accessible home link for the approved Classy Apparels artwork. */
export default function BrandLogo({
  variant = "wide",
  className = "",
  priority = false,
}: {
  variant?: BrandLogoVariant;
  className?: string;
  priority?: boolean;
}) {
  const asset = assets[variant];
  return (
    <Link href="/" className={`brand-logo brand-logo-${variant} ${className}`.trim()} aria-label="Classy Apparels by Sana home">
      <Image src={asset.src} width={asset.width} height={asset.height} alt="" priority={priority} sizes={variant === "wide" ? "(max-width: 600px) 140px, 240px" : "(max-width: 600px) 130px, 180px"} />
    </Link>
  );
}
