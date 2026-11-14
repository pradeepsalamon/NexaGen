import type { MetadataRoute } from "next";
import { LEGAL_DRAFT } from "@/features/legal/content";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { changeFrequency: "weekly", path: "/", priority: 1 },
    { changeFrequency: "yearly", path: "/register", priority: 0.5 },
    { changeFrequency: "yearly", path: "/login", priority: 0.3 },
    // Listed once they're final: while drafts they are noindex.
    ...(LEGAL_DRAFT
      ? []
      : [
          { changeFrequency: "yearly", path: "/privacy", priority: 0.2 },
          { changeFrequency: "yearly", path: "/terms", priority: 0.2 }
        ])
  ].map(({ path, ...entry }) => ({ ...entry, url: `${SITE_URL}${path}` })) as MetadataRoute.Sitemap;
}
