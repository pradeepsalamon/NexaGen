import { MessageCircle, Phone, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const contactEmail = "nexachessacademy@gmail.com";

const contactMethods: {
  Icon: LucideIcon;
  label: string;
  value: string;
  href: string;
  color: string;
  borderHover: string;
  iconClass: string;
}[] = [
  {
    Icon: MessageCircle,
    label: "WhatsApp",
    value: "+91 93449 67940",
    href: "https://api.whatsapp.com/send?phone=919344967940&text=Hi! I'm interested in chess classes",
    color: "from-green-500/20 to-green-600/5",
    borderHover: "hover:border-green-500/30",
    iconClass: "!text-green-600 !bg-green-500/[0.1] !border-green-500/25"
  },
  {
    Icon: Phone,
    label: "Phone",
    value: "+91 70108 54643",
    href: "tel:+9170108 54643",
    color: "from-blue-500/20 to-blue-600/5",
    borderHover: "hover:border-blue-500/30",
    iconClass: "!text-blue-600 !bg-blue-500/[0.1] !border-blue-500/25"
  },
  {
    Icon: Mail,
    label: "Email",
    value: contactEmail,
    href: `mailto:${contactEmail}`,
    color: "from-gold/20 to-gold-dark/5",
    borderHover: "hover:border-gold/30",
    iconClass: "icon-tile-accent"
  }
];

export function ContactSection() {
  return (
    <section id="contact" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#f8fafc] to-white" />
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="section-head mb-16 reveal reveal-up" style={{ transitionDelay: "0s" }}>
          <span className="eyebrow mb-5">
            <span className="eyebrow-dot" />
            Get In Touch
          </span>
          <h2 className="section-title font-[family-name:var(--font-playfair)] mb-4">
            Ready to <span className="gold-text">Start</span>?
          </h2>
          <p className="section-sub">
            Reach out to us anytime — we&apos;re here to help you begin your chess journey
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6 mb-12">
          {contactMethods.map((method, i) => (
            <a
              key={method.label}
              href={method.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative u-card p-7 ${method.borderHover} card-lift text-center reveal reveal-up`}
              style={{ transitionDelay: `${0.2 + i * 0.1}s` }}
            >
              <div
                className={`absolute inset-0 rounded-[1.25rem] bg-gradient-to-br ${method.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
              />
              <div className="relative">
                <div className="flex justify-center mb-4">
                  <span className={`icon-tile icon-tile-lg ${method.iconClass}`}>
                    <method.Icon className="w-6 h-6" strokeWidth={1.75} />
                  </span>
                </div>
                <div className="text-[0.6875rem] text-text-muted uppercase tracking-[0.16em] font-semibold mb-1.5">
                  {method.label}
                </div>
                <div className="text-text-primary font-medium text-sm break-words">{method.value}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
