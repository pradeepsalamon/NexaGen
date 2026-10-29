import { MessageCircle, Phone, Mail, BookOpen, Users, ArrowRight, Sparkles } from "lucide-react";
import { ACADEMY_EMAIL, ACADEMY_PHONE, ACADEMY_WHATSAPP } from "../content";

// content.ts is the one source of the contact details (JSON-LD and llms.txt
// read it too). "+91-7010854643" → "+91 7010854643" / "917010854643".
const displayNumber = (value: string) => value.replace("-", " ");
const digits = (value: string) => value.replace(/\D/g, "");
const whatsappHref = `https://wa.me/${digits(ACADEMY_WHATSAPP)}`;

const conversionOptions = [
  {
    title: "Book a Free Class",
    subtitle: "Start your chess journey with a 1-on-1 evaluation session.",
    href: "#demo",
    cta: "Book Free Class",
    primary: true,
    Icon: Sparkles
  },
  {
    title: "Explore Programs",
    subtitle: "Find the right structured learning path for your current level.",
    href: "#programs",
    cta: "View Programs",
    primary: false,
    Icon: BookOpen
  },
  {
    title: "Join Our Community",
    subtitle: "Connect with fellow players, tournaments, and master workshops.",
    href: whatsappHref,
    cta: "Chat on WhatsApp",
    primary: false,
    Icon: Users
  }
];

const directContacts = [
  {
    label: "WhatsApp",
    value: displayNumber(ACADEMY_WHATSAPP),
    href: whatsappHref,
    Icon: MessageCircle
  },
  {
    label: "Direct Phone",
    value: displayNumber(ACADEMY_PHONE),
    href: `tel:+${digits(ACADEMY_PHONE)}`,
    Icon: Phone
  },
  {
    label: "Email Support",
    value: ACADEMY_EMAIL,
    href: `mailto:${ACADEMY_EMAIL}`,
    Icon: Mail
  }
];

// Only real web links should open a new tab (not #anchors, tel: or mailto:)
const isWebLink = (href: string) => href.startsWith("http");

export function ContactSection() {
  return (
    <section id="contact" className="relative py-20 sm:py-28 bg-[var(--background)]">
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="section-head mb-14 text-center max-w-2xl mx-auto">
          <span className="eyebrow mb-4">
            <span className="eyebrow-dot" />
            Get Started
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-[family-name:var(--font-playfair)] tracking-[-0.02em] text-[var(--text-primary)] mb-4">
            Ready to Start?
          </h2>
          <p className="text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Take the first step toward becoming a stronger chess player.
          </p>
        </div>

        {/* 3 Conversion Option Cards: 1 col on phones, 2 + 1 full-width on tablets, 3 across on desktop */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16 items-stretch">
          {conversionOptions.map((opt, idx) => {
            const external = isWebLink(opt.href);
            const isLast = idx === conversionOptions.length - 1;

            return (
              <div
                key={opt.title}
                className={`flex flex-col justify-between p-6 sm:p-8 rounded-2xl bg-[var(--surface)] border card-lift shadow-xs transition-all duration-200 ${isLast ? "sm:max-lg:col-span-2" : ""
                  } ${opt.primary
                    ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                    : "border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
              >
                <div>
                  <div
                    className={`size-12 rounded-[10px] flex items-center justify-center mb-5 ${opt.primary
                      ? "bg-[var(--accent)] text-[#030D24]"
                      : "bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)]"
                      }`}
                  >
                    <opt.Icon className="size-6" strokeWidth={1.8} />
                  </div>

                  <h3 className="text-xl font-bold font-[family-name:var(--font-playfair)] text-[var(--text-primary)] mb-2">
                    {opt.title}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                    {opt.subtitle}
                  </p>
                </div>

                <a
                  href={opt.href}
                  {...(external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className={`group/cta w-full flex items-center justify-center ${opt.primary ? "btn-gold" : "btn-outline-gold"
                    } font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50`}
                >
                  {opt.cta}
                  <ArrowRight className="size-4 ml-1 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                </a>
              </div>
            );
          })}
        </div>

        {/* Supporting Direct Contact Row */}
        <div className="pt-10 border-t border-[var(--border)]">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {directContacts.map((contact, idx) => {
              const external = isWebLink(contact.href);
              const isLast = idx === directContacts.length - 1;

              return (
                <a
                  key={contact.label}
                  href={contact.href}
                  {...(external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className={`flex items-center gap-3.5 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] focus-visible:outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 transition-colors duration-200 group ${isLast ? "sm:max-lg:col-span-2" : ""
                    }`}
                >
                  <div className="size-10 rounded-[10px] bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] shrink-0 transition-colors">
                    <contact.Icon className="size-5" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      {contact.label}
                    </div>
                    <div
                      title={contact.value}
                      className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate"
                    >
                      {contact.value}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}