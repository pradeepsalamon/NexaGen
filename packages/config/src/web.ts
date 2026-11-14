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
  NEXT_PUBLIC_SITE_URL?: string | undefined;
}) {
  return webEnvSchema.parse(source);
}
