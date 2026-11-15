import Link from "next/link";
import { Globe, Mail, Phone } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Facebook, Instagram, Linkedin, Youtube } from "@/components/icons/BrandIcons";
import { ACADEMY_EMAIL, ACADEMY_PHONE, ACADEMY_SOCIAL_PROFILES } from "../content";

type LinkItem = { href: string; isRoute?: boolean; label: string };

const columns: { links: LinkItem[]; title: string }[] = [
  {
    links: [
      { href: "#home", label: "Home" },
      { href: "#programs", label: "Programs" },
      { href: "#class-types", label: "Coaching" },
      { href: "#sunday-training", label: "Tournaments" },
      { href: "#why-choose-us", label: "About" }
    ],
    title: "Quick links"
  },
  {
    links: [
      { href: "#programs", label: "Beginner" },
      { href: "#programs", label: "Intermediate" },
      { href: "#programs", label: "Advanced" },
      { href: "#sunday-training", label: "Sunday training" }
    ],
    title: "Programs"
  },
  {
    links: [
      { href: "#faq", label: "FAQ" },
      { href: "#contact", label: "Contact" },
      { href: "/terms", isRoute: true, label: "Terms" },
      { href: "/privacy", isRoute: true, label: "Privacy" }
    ],
    title: "Support"
  }
];

const socialIcons = [
  { host: "facebook.com", Icon: Facebook, label: "Facebook" },
  { host: "instagram.com", Icon: Instagram, label: "Instagram" },
  { host: "youtube.com", Icon: Youtube, label: "YouTube" },
  { host: "linkedin.com", Icon: Linkedin, label: "LinkedIn" }
];

// Only profiles listed in content.ts show, so the footer never links a placeholder.
const socialLinks = socialIcons.flatMap(({ host, ...icon }) => {
  const href = ACADEMY_SOCIAL_PROFILES.find((url) => url.includes(host));
  return href ? [{ ...icon, href }] : [];
});

const LINK = "text-sm font-normal text-app-muted transition-colors hover:text-app-text";

/** Navy footer in both themes (`surface-brand`), like the navbar. */
export function AcademyFooter() {
  return (
    <footer className="surface-brand bg-app-background text-app-text">
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="grid content-start gap-5 lg:col-span-5">
            <Logo onDark size={44} />
            <p className="max-w-sm text-sm text-app-muted">
              A premium chess coaching and learning platform for students, parents, and competitive chess players.
              Building international champions since 2018.
            </p>
            <ul className="grid gap-3 text-sm">
              <li>
                <a className={`${LINK} inline-flex items-center gap-3`} href={`tel:+${ACADEMY_PHONE.replace(/\D/g, "")}`}>
                  <Phone aria-hidden="true" className="size-4 shrink-0 text-accent-ink" strokeWidth={2.25} />
                  {ACADEMY_PHONE.replace("-", " ")}
                </a>
              </li>
              <li>
                <a className={`${LINK} inline-flex items-center gap-3`} href={`mailto:${ACADEMY_EMAIL}`}>
                  <Mail aria-hidden="true" className="size-4 shrink-0 text-accent-ink" strokeWidth={2.25} />
                  {ACADEMY_EMAIL}
                </a>
              </li>
              <li className="inline-flex items-center gap-3 text-app-muted">
                <Globe aria-hidden="true" className="size-4 shrink-0 text-accent-ink" strokeWidth={2.25} />
                Online classes worldwide
              </li>
            </ul>
            {socialLinks.length > 0 ? (
              <ul className="flex items-center gap-2">
                {socialLinks.map(({ href, Icon, label }) => (
                  <li key={label}>
                    <a
                      aria-label={label}
                      className="flex size-9 items-center justify-center rounded-full border border-app-border text-app-muted transition-colors hover:text-app-text"
                      href={href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <Icon className="size-4" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {columns.map(({ links, title }) => (
              <div className="grid content-start gap-4" key={title}>
                <h3 className="text-sm font-semibold text-app-text">{title}</h3>
                <ul className="grid gap-3">
                  {links.map((link) => (
                    <li key={link.label}>
                      {link.isRoute ? (
                        <Link className={LINK} href={link.href}>
                          {link.label}
                        </Link>
                      ) : (
                        <a className={LINK} href={link.href}>
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-app-border pt-6 text-sm text-app-muted md:flex-row">
          <p>© {new Date().getFullYear()} Nexa Chess Academy. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link className={LINK} href="/privacy">
              Privacy policy
            </Link>
            <Link className={LINK} href="/terms">
              Terms of service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
