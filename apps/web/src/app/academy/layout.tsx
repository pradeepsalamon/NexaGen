import type { Metadata } from "next";
import "@/features/academy/styles/academy.css";
import { ScrollObserver } from "@/features/academy/components/ScrollObserver";
import { TrackingProvider } from "@/features/academy/components/TrackingProvider";
import { ACADEMY_NAME } from "@/features/academy/content";
import { academyJsonLd, jsonLdScript } from "@/lib/structuredData";
import { declareFontVariables } from "../fonts";
import { ACADEMY_FONT_FACES } from "./fonts.generated";

// The marketing site's own Inter (preloaded here only) + Playfair. A separate
// module, so the app's routes neither load nor preload them.
const academyFontVariablesCss = declareFontVariables(".academy-page", ACADEMY_FONT_FACES);

const TITLE = `Online Chess Classes for Kids & Adults | ${ACADEMY_NAME}`;
const DESCRIPTION =
  "Live online chess classes with FIDE-rated coaches: beginner to advanced, 1-on-1, buddy or group, plus Sunday tournament training. Book a free demo class.";

export const metadata: Metadata = {
  // absolute: the root layout's "| Nexa Chess" template would name the brand twice.
  title: { absolute: TITLE, template: `%s | ${ACADEMY_NAME}` },
  description: DESCRIPTION,
  applicationName: ACADEMY_NAME,
  keywords: [
    "online chess classes",
    "chess academy",
    "chess coaching online",
    "chess classes for kids",
    "learn chess online",
    "chess coach India",
    "FIDE rated chess coach",
    "chess tournament preparation",
    "free chess demo class",
    "Nexa Chess",
    "Nexa Chess Academy"
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: ACADEMY_NAME,
    type: "website",
    locale: "en_IN",
    url: "/academy"
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION
  },
  alternates: { canonical: "/academy" },
  category: "education"
};

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="academy-page relative font-[family-name:var(--font-inter)]">
      <style dangerouslySetInnerHTML={{ __html: academyFontVariablesCss }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(academyJsonLd()) }} />
      <TrackingProvider />
      <ScrollObserver />
      {children}
    </div>
  );
}
