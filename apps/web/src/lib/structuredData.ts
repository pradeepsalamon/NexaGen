import {
  ACADEMY_ALTERNATE_NAMES,
  ACADEMY_DESCRIPTION,
  ACADEMY_EMAIL,
  ACADEMY_FAQ,
  ACADEMY_LOGO_PATH,
  ACADEMY_NAME,
  ACADEMY_PHONE,
  ACADEMY_PROGRAMS,
  ACADEMY_SOCIAL_PROFILES,
  ACADEMY_TOPICS,
  ACADEMY_WHATSAPP
} from "@/features/academy/content";
import { SITE_NAME, SITE_URL } from "./site";

// schema.org JSON-LD for the public pages. Every page points at the SAME
// organization and website `@id`, so Google's Knowledge Graph and AI engines
// see one entity ("Nexa Chess Academy", a.k.a. "Nexa Chess") rather than two.

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

function organization() {
  return {
    "@id": ORG_ID,
    "@type": "EducationalOrganization",
    alternateName: ACADEMY_ALTERNATE_NAMES,
    areaServed: "Worldwide",
    contactPoint: [
      {
        "@type": "ContactPoint",
        areaServed: "Worldwide",
        availableLanguage: ["English"],
        contactType: "admissions",
        email: ACADEMY_EMAIL,
        telephone: ACADEMY_PHONE
      },
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        description: "WhatsApp",
        telephone: ACADEMY_WHATSAPP
      }
    ],
    description: ACADEMY_DESCRIPTION,
    email: ACADEMY_EMAIL,
    knowsAbout: ACADEMY_TOPICS,
    logo: { "@type": "ImageObject", url: `${SITE_URL}${ACADEMY_LOGO_PATH}` },
    name: ACADEMY_NAME,
    ...(ACADEMY_SOCIAL_PROFILES.length ? { sameAs: ACADEMY_SOCIAL_PROFILES } : {}),
    telephone: ACADEMY_PHONE,
    url: `${SITE_URL}/`
  };
}

function website() {
  return {
    "@id": WEBSITE_ID,
    "@type": "WebSite",
    alternateName: [ACADEMY_NAME, ...ACADEMY_ALTERNATE_NAMES.filter((n) => n !== SITE_NAME)],
    inLanguage: "en",
    name: SITE_NAME,
    publisher: { "@id": ORG_ID },
    url: `${SITE_URL}/`
  };
}

/** `/`: who we are and the site itself. */
export function homeJsonLd() {
  return { "@context": "https://schema.org", "@graph": [organization(), website()] };
}

/** `/academy`: the organization, its three programs as courses, and the FAQ shown on the page. */
export function academyJsonLd() {
  const pageUrl = `${SITE_URL}/academy`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(),
      website(),
      {
        "@id": `${pageUrl}#webpage`,
        "@type": "WebPage",
        about: { "@id": ORG_ID },
        description: ACADEMY_DESCRIPTION,
        inLanguage: "en",
        isPartOf: { "@id": WEBSITE_ID },
        name: `${ACADEMY_NAME} — Online Chess Classes`,
        url: pageUrl
      },
      ...ACADEMY_PROGRAMS.map((program) => ({
        "@id": `${pageUrl}#course-${program.educationalLevel.toLowerCase()}`,
        "@type": "Course",
        description: program.summary,
        educationalLevel: program.educationalLevel,
        hasCourseInstance: {
          "@type": "CourseInstance",
          courseMode: "Online",
          courseSchedule: { "@type": "Schedule", repeatFrequency: "P1W" },
          // Each class runs 45–55 minutes (the "Every Session" section).
          courseWorkload: "PT55M"
        },
        inLanguage: "en",
        name: `${program.level} Online Chess Course`,
        provider: { "@id": ORG_ID },
        teaches: program.topics,
        url: `${pageUrl}#programs`
      })),
      {
        "@id": `${pageUrl}#faq`,
        "@type": "FAQPage",
        isPartOf: { "@id": `${pageUrl}#webpage` },
        mainEntity: ACADEMY_FAQ.map((item) => ({
          "@type": "Question",
          acceptedAnswer: { "@type": "Answer", text: item.answer },
          name: item.question
        }))
      }
    ]
  };
}

/** Safe to drop into a <script type="application/ld+json">: `<` can't close the tag. */
export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
