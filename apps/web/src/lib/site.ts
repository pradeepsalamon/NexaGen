import { getWebEnv } from "@nexa-chess/config/web";

const env = getWebEnv({
  NEXT_PUBLIC_BING_SITE_VERIFICATION: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL
});

export const SITE_URL = env.NEXT_PUBLIC_SITE_URL;
export const GOOGLE_SITE_VERIFICATION = env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined;
export const BING_SITE_VERIFICATION = env.NEXT_PUBLIC_BING_SITE_VERIFICATION || undefined;
/** Meta Pixel id (build-time); undefined = no pixel and no cookie banner (docs/AD_MEASUREMENT.md). */
export const META_PIXEL_ID = env.NEXT_PUBLIC_META_PIXEL_ID || undefined;

export const SITE_NAME = "Nexa Chess";
