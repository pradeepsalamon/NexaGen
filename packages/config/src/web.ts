import { z } from "zod";

const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .string()
    .url()
    .default("http://localhost:3001")
    .transform((url) => url.replace(/\/$/, ""))
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function getWebEnv(source: { NEXT_PUBLIC_API_URL?: string | undefined }) {
  return webEnvSchema.parse(source);
}
