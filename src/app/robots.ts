import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/marketing/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/workspace/",
        "/dashboard",
        "/auth/",
        "/login",
        "/sign-up",
        "/mfa",
        "/onboarding",
        "/forgot-password",
        "/reset-password",
        "/share",
        "/evidence",
        "/partner-invitation",
        "/notifications/",
      ],
    },
    sitemap: siteUrl("/sitemap.xml").href,
  };
}
