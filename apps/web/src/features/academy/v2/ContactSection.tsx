import { ArrowRight, BookOpen, Mail, MessageCircle, Phone, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ACADEMY_EMAIL, ACADEMY_PHONE, ACADEMY_WHATSAPP } from "../content";
import { Section, SectionHeader } from "./parts";

const displayNumber = (value: string) => value.replace("-", " ");
const digits = (value: string) => value.replace(/\D/g, "");
const whatsappHref = `https://wa.me/${digits(ACADEMY_WHATSAPP)}`;
const isWebLink = (href: string) => href.startsWith("http");
const externalProps = (href: string) => (isWebLink(href) ? { rel: "noopener noreferrer", target: "_blank" } : {});

const conversionOptions = [
  {
    cta: "Book a free class",
    href: "#demo",
    Icon: Sparkles,
    primary: true,
    subtitle: "Start your chess journey with a 1-on-1 evaluation session.",
    title: "Book a free class"
  },
  {
    cta: "View programs",
    href: "#programs",
    Icon: BookOpen,
    primary: false,
    subtitle: "Find the right structured learning path for your current level.",
    title: "Explore programs"
  },
  {
    cta: "Chat on WhatsApp",
    href: whatsappHref,
    Icon: Users,
    primary: false,
    subtitle: "Connect with fellow players, tournaments, and master workshops.",
    title: "Join our community"
  }
];

const directContacts = [
  { href: whatsappHref, Icon: MessageCircle, label: "WhatsApp", value: displayNumber(ACADEMY_WHATSAPP) },
  { href: `tel:+${digits(ACADEMY_PHONE)}`, Icon: Phone, label: "Phone", value: displayNumber(ACADEMY_PHONE) },
  { href: `mailto:${ACADEMY_EMAIL}`, Icon: Mail, label: "Email", value: ACADEMY_EMAIL }
];

export function ContactSection() {
  return (
    <Section id="contact" labelledBy="contact-heading">
      <SectionHeader
        description="Take the first step toward becoming a stronger chess player."
        eyebrow="Get started"
        id="contact-heading"
        title="Ready to start?"
      />

      <ul className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {conversionOptions.map(({ cta, href, Icon, primary, subtitle, title }, idx) => (
          <li
            className={cn(
              "flex flex-col gap-4 rounded-panel border bg-app-surface p-6 shadow-card",
              primary ? "border-primary ring-1 ring-primary" : "border-app-border",
              idx === conversionOptions.length - 1 && "sm:max-lg:col-span-2"
            )}
            key={title}
          >
            <span className="flex size-11 items-center justify-center rounded-control bg-primary-soft text-primary-ink">
              <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
            </span>
            <div className="grid flex-1 content-start gap-1">
              <h3 className="text-lg font-bold text-app-text">{title}</h3>
              <p className="text-sm text-app-muted">{subtitle}</p>
            </div>
            <Button asChild fullWidth variant={primary ? "primary" : "neutral"}>
              <a href={href} {...externalProps(href)}>
                {cta}
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
              </a>
            </Button>
          </li>
        ))}
      </ul>

      <ul className="mt-10 grid grid-cols-1 gap-4 border-t border-app-border pt-10 sm:grid-cols-2 lg:grid-cols-3">
        {directContacts.map(({ href, Icon, label, value }, idx) => (
          <li className={cn(idx === directContacts.length - 1 && "sm:max-lg:col-span-2")} key={label}>
            <a
              className="flex items-center gap-3 rounded-app border border-app-border bg-app-surface p-4 font-normal transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
              href={href}
              {...externalProps(href)}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-app-soft text-app-text">
                <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
              </span>
              <span className="grid min-w-0">
                <span className="text-sm text-app-muted">{label}</span>
                <span className="truncate text-sm font-semibold text-app-text">{value}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
