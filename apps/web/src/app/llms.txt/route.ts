import {
  ACADEMY_CLASS_FORMATS,
  ACADEMY_DESCRIPTION,
  ACADEMY_EMAIL,
  ACADEMY_FAQ,
  ACADEMY_NAME,
  ACADEMY_PHONE,
  ACADEMY_PROGRAMS,
  ACADEMY_SOCIAL_PROFILES,
  ACADEMY_WHATSAPP
} from "@/features/academy/content";
import { SITE_URL } from "@/lib/site";

// /llms.txt (llmstxt.org): a plain-markdown brief AI assistants can read in one
// request. Built from the same facts as the page and its JSON-LD.
export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${ACADEMY_NAME}`,
    "",
    `> ${ACADEMY_DESCRIPTION}`,
    "",
    `${ACADEMY_NAME} (also called Nexa Chess) is at ${SITE_URL}. Classes are live and online, so students join from anywhere; the academy has students in more than 8 countries.`,
    "",
    "## Main pages",
    "",
    `- [Online chess classes — programs, formats, timings, FAQ and free demo booking](${SITE_URL}/academy)`,
    `- [Home](${SITE_URL}/)`,
    `- [Create a student account](${SITE_URL}/register)`,
    "",
    "## Programs",
    "",
    ...ACADEMY_PROGRAMS.map((p) => `- **${p.level}**: ${p.summary} Topics: ${p.topics.join(", ")}.`),
    "",
    "## Class formats",
    "",
    ...ACADEMY_CLASS_FORMATS.map((f) => `- **${f.name}**: ${f.description}`),
    "",
    "## Frequently asked questions",
    "",
    ...ACADEMY_FAQ.flatMap((f) => [`### ${f.question}`, "", f.answer, ""]),
    "## Contact",
    "",
    `- Email: ${ACADEMY_EMAIL}`,
    `- Phone: ${ACADEMY_PHONE}`,
    `- WhatsApp: ${ACADEMY_WHATSAPP}`,
    `- Free demo class: ${SITE_URL}/academy#demo`,
    ...ACADEMY_SOCIAL_PROFILES.map((url) => `- ${url}`),
    ""
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "text/markdown; charset=utf-8"
    }
  });
}
