import { getWebEnv } from "@nexa-chess/config/web";

const env = getWebEnv({
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL
});

export const SITE_URL = env.NEXT_PUBLIC_SITE_URL;
export const GOOGLE_SITE_VERIFICATION = env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined;

export const SITE_NAME = "Nexa Chess";
