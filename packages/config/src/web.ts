import { z } from "zod";

const webEnvSchema = z.object({
  // Bing Webmaster Tools <meta name="msvalidate.01"> token (Bing also feeds ChatGPT / Copilot search).
  NEXT_PUBLIC_BING_SITE_VERIFICATION: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  NEXT_PUBLIC_API_URL: z
    .string()
    .url()
    .default("http://localhost:3001")
    .transform((url) => url.replace(/\/$/, "")),
  NEXT_PUBLIC_LIVEKIT_URL: z.string().url().default("ws://localhost:7880"),
  // Nexa's own hosts call the API same-origin under `/api` (like academies), so the API's
  // PLATFORM_HOST_ONLY_COOKIES can keep their session host-only. Needs the nginx `/api/` rule.
  NEXT_PUBLIC_PLATFORM_SAME_ORIGIN_API: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Public origin of the web app: canonical URLs, sitemap, Open Graph.
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    .transform((url) => url.replace(/\/$/, ""))
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function getWebEnv(source: { 
  NEXT_PUBLIC_BING_SITE_VERIFICATION?: string | undefined;
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?: string | undefined;
  NEXT_PUBLIC_API_URL?: string | undefined;
  NEXT_PUBLIC_LIVEKIT_URL?: string | undefined;
  NEXT_PUBLIC_PLATFORM_SAME_ORIGIN_API?: string | undefined;
  NEXT_PUBLIC_SITE_URL?: string | undefined;
}) {
  return webEnvSchema.parse(source);
}
