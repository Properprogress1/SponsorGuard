import type { Metadata } from "next";

export const siteName = "SponsorGuard UK";
export const recordsDisclaimer =
  "SponsorGuard tracks your records. It does not provide immigration advice or guarantee compliance.";
export const discoverablePages = ["/", "/pricing", "/health-check"] as const;

export function siteUrl(path: string) {
  return new URL(
    path,
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  );
}

export function publicMetadata(
  title: string,
  description: string,
  path: string,
  index = true,
): Metadata {
  const brandedTitle = `${title} | ${siteName}`;
  const url = siteUrl(path);
  return {
    title: brandedTitle,
    description,
    alternates: { canonical: url },
    robots: { index, follow: true },
    openGraph: {
      type: "website",
      title: brandedTitle,
      description,
      url,
      siteName,
      locale: "en_GB",
      images: [
        {
          url: siteUrl("/marketing/records-desk.webp"),
          alt: "Organised paper files on a desk by a window",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: brandedTitle,
      description,
      images: [siteUrl("/marketing/records-desk.webp")],
    },
  };
}
