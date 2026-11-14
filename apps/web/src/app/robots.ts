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

/**
 * Search and AI-answer crawlers, named so it's explicit that they're welcome:
 * being readable by these is what lets ChatGPT, Gemini, Claude, Perplexity,
 * Copilot and Apple Intelligence cite nexachess.in. A named group replaces the
 * `*` group for that bot, so each repeats the same private paths.
 */
const ANSWER_ENGINE_BOTS = [
  "Googlebot",
  "Google-Extended",
  "Bingbot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
  "Applebot-Extended",
  "DuckAssistBot",
  "meta-externalagent",
  "Amazonbot"
];

export default function robots(): MetadataRoute.Robots {
  return {
    host: SITE_URL,
    rules: [
      { allow: "/", disallow: PRIVATE_PATHS, userAgent: ANSWER_ENGINE_BOTS },
      { allow: "/", disallow: PRIVATE_PATHS, userAgent: "*" }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
