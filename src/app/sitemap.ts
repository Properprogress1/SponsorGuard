import type { MetadataRoute } from "next";
import { discoverablePages, siteUrl } from "@/lib/marketing/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return discoverablePages.map((path) => ({ url: siteUrl(path).href }));
}
