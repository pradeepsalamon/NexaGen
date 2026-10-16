import type { Metadata } from "next";
import "@/features/academy/styles/academy.css";
import { ScrollObserver } from "@/features/academy/components/ScrollObserver";
import { TrackingProvider } from "@/features/academy/components/TrackingProvider";
import { SITE_URL } from "@/lib/site";
import { declareFontVariables } from "../fonts";
import { ACADEMY_FONT_FACES } from "./fonts.generated";

// The marketing site's own Inter (preloaded here only) + Playfair. A separate
// module, so the app's routes neither load nor preload them.
const academyFontVariablesCss = declareFontVariables(".academy-page", ACADEMY_FONT_FACES);

const SITE_NAME = "Nexa Chess Academy";
const SITE_DESCRIPTION =
  "Professional online chess training for beginners, intermediate, and advanced players. Expert coaching, flexible scheduling, and tournament preparation.";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} | Professional Online Chess Training`,
    template: `%s | ${SITE_NAME}`
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "chess academy",
    "online chess classes",
    "chess coaching",
    "learn chess",
    "chess training",
    "chess for kids",
    "tournament preparation"
  ],
  openGraph: {
    title: `${SITE_NAME} | Professional Online Chess Training`,
    description: "Master chess with expert coaching. Professional online chess training for all levels.",
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    url: "/academy",
    images: [{ url: "/academy/nexa_logo_light1.png", alt: SITE_NAME }]
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Professional Online Chess Training`,
    description: "Master chess with expert coaching. Professional online chess training for all levels.",
    images: ["/academy/nexa_logo_light1.png"]
  },
  alternates: { canonical: "/academy" },
  category: "education"
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: `${SITE_URL}/academy`,
  logo: `${SITE_URL}/academy/nexa_logo_light1.png`,
  email: "nexachessacademy@gmail.com",
  telephone: "+91-7010854643",
  areaServed: "Worldwide"
};

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="academy-page relative font-[family-name:var(--font-inter)]">
      <style dangerouslySetInnerHTML={{ __html: academyFontVariablesCss }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <TrackingProvider />
      <ScrollObserver />
      {children}
    </div>
  );
}
