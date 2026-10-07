import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { changeFrequency: "weekly", path: "/academy", priority: 1 },
    { changeFrequency: "monthly", path: "/", priority: 0.8 },
    { changeFrequency: "yearly", path: "/register", priority: 0.5 },
    { changeFrequency: "yearly", path: "/login", priority: 0.3 }
  ].map(({ path, ...entry }) => ({ ...entry, url: `${SITE_URL}${path}` })) as MetadataRoute.Sitemap;
}
