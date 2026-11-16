import type { Metadata } from "next";
import { ACADEMY_NAME } from "@/features/academy/content";
import { AcademyHomeV2 } from "@/features/academy/v2/AcademyHomeV2";
import { AcademyHome } from "@/features/branding/components/AcademyHome";
import { academyJsonLd, jsonLdScript } from "@/lib/structuredData";

const TITLE = `Online Chess Classes for Kids & Adults | ${ACADEMY_NAME}`;
const DESCRIPTION =
  "Live online chess classes with FIDE-rated coaches: beginner to advanced, 1-on-1, buddy or group, plus Sunday tournament training. Book a free demo class.";

export const metadata: Metadata = {
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
    url: "/"
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION
  },
  alternates: { canonical: "/" },
  category: "education"
};

/**
 * `/` renders the Design System v2 academy page (owner, 2026-11-16: swapped with
 * `/academy`, which now keeps the original page for reference).
 */
export default function Home() {
  return (
    <>
      {/* Another academy's own address shows its generic home instead (§F; hidden before first paint). */}
      <AcademyHome />
      <AcademyHomeV2 className="platform-brand-only">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(academyJsonLd()) }}
        />
      </AcademyHomeV2>
    </>
  );
}
