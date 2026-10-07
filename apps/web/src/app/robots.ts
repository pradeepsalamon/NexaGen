import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Signed-in, guest-invite and recorder routes have nothing for a crawler.
const PRIVATE_PATHS = [
  "/admin",
  "/checkout",
  "/chess-board",
  "/classes",
  "/coach",
  "/demo",
  "/live-class",
  "/plans",
  "/profile",
  "/recorder",
  "/reset-password",
  "/student",
  "/verify-email"
];

export default function robots(): MetadataRoute.Robots {
  return {
    host: SITE_URL,
    rules: { allow: "/", disallow: PRIVATE_PATHS, userAgent: "*" },
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
