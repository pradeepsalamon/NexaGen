"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronRight,
  ChevronDown,
  Phone,
  Mail,
  Globe
} from "lucide-react";

// Make sure this path matches where you created the BrandIcons file
import {
  Facebook,
  Instagram,
  Youtube,
  Linkedin
} from "@/components/icons/BrandIcons";
import { ACADEMY_EMAIL, ACADEMY_PHONE, ACADEMY_SOCIAL_PROFILES } from "../content";

type LinkItem = {
  label: string;
  href: string;
  isRoute?: boolean;
};

const quickLinks: LinkItem[] = [
  { label: "Home", href: "#home" },
  { label: "Programs", href: "#programs" },
  { label: "Coaching", href: "#class-types" },
  { label: "Tournaments", href: "#sunday-training" },
  { label: "About", href: "#why-choose-us" }
];

const programLinks: LinkItem[] = [
  { label: "Beginner", href: "#programs" },
  { label: "Intermediate", href: "#programs" },
  { label: "Advanced", href: "#programs" },
  { label: "Sunday Training", href: "#sunday-training" }
];

const supportLinks: LinkItem[] = [
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
  { label: "Terms", href: "/terms", isRoute: true },
  { label: "Privacy", href: "/privacy", isRoute: true }
];

const socialIcons = [
  { Icon: Facebook, host: "facebook.com", label: "Facebook" },
  { Icon: Instagram, host: "instagram.com", label: "Instagram" },
  { Icon: Youtube, host: "youtube.com", label: "YouTube" },
  { Icon: Linkedin, host: "linkedin.com", label: "LinkedIn" }
];

// Only the academy's real profiles (content.ts, also in the JSON-LD sameAs);
// none listed means no icons rather than dead "#" links.
const socialLinks = socialIcons.flatMap(({ host, ...icon }) => {
  const href = ACADEMY_SOCIAL_PROFILES.find((url) => url.includes(host));
  return href ? [{ ...icon, href }] : [];
});

const linkClassName =
  "text-[13px] sm:text-sm text-[#555C68] dark:text-[#C1C4CC] hover:text-[#C88E2B] dark:hover:text-[#E2B355] transition-colors flex items-center gap-2 group";

const headingClassName =
  "text-[12px] font-bold uppercase tracking-[0.12em] text-[#C88E2B] dark:text-[#E2B355]";

// Defined at module level (not inside AcademyFooter) so React doesn't
// remount these lists every time an accordion opens or closes.
function FooterLinks({ links }: { links: LinkItem[] }) {
  const content = (label: string) => (
    <>
      <ChevronRight className="size-3.5 text-[#C88E2B] dark:text-[#E2B355] opacity-70 group-hover:translate-x-0.5 transition-transform" />
      {label}
    </>
  );

  return (
    <ul className="space-y-3">
      {links.map((link) => (
        <li key={link.label}>
          {link.isRoute ? (
            <Link href={link.href} className={linkClassName}>
              {content(link.label)}
            </Link>
          ) : (
            <a href={link.href} className={linkClassName}>
              {content(link.label)}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

interface FooterColumnProps {
  id: string;
  title: string;
  links: LinkItem[];
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

function FooterColumn({
  id,
  title,
  links,
  isOpen,
  onToggle,
  className = ""
}: FooterColumnProps) {
  const panelId = `footer-panel-${id}`;

  return (
    <div className={`py-4 sm:py-0 ${className}`}>
      {/* Mobile: accordion trigger */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="sm:hidden w-full flex items-center justify-between text-left"
      >
        <span className={headingClassName}>{title}</span>
        <ChevronDown
          className={`size-4 text-[#C88E2B] dark:text-[#E2B355] transition-transform duration-200 ${isOpen ? "rotate-180" : ""
            }`}
        />
      </button>

      {/* Desktop: plain heading (no dead button to tab through) */}
      <h3 className={`hidden sm:block ${headingClassName}`}>{title}</h3>

      {/*
        grid-rows 0fr -> 1fr animates to the list's real height (no fixed
        max-height to clip or leave a gap). Always open from `sm` up.
      */}
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out sm:grid-rows-[1fr] sm:opacity-100 ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
      >
        {/* `invisible` when collapsed keeps hidden links out of the tab order */}
        <div
          className={`min-h-0 overflow-hidden transition-[visibility] duration-300 sm:visible ${isOpen ? "visible" : "invisible"
            }`}
        >
          <div className="pt-4">
            <FooterLinks links={links} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AcademyFooter() {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  return (
    <footer className="relative bg-[#FFFFFF] dark:bg-[#030D24] border-t border-[#E5E9F0] dark:border-white/10 select-none">
      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">

        {/* ================= MAIN FOOTER CONTENT ================= */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">

          {/* Brand Info */}
          <div className="md:col-span-12 lg:col-span-5 flex flex-col items-center md:items-start text-center md:text-left">
            <div className="relative h-12 w-48 mb-5 flex items-center justify-center md:justify-start">
              <Image
                src="/academy/nexa_logo_dark1.png"
                alt="NEXA Chess Academy"
                width={180}
                height={50}
                className="h-10 sm:h-12 w-auto object-contain hidden dark:block"
              />
              <Image
                src="/academy/nexa_logo_light1.png"
                alt="NEXA Chess Academy"
                width={180}
                height={50}
                className="h-10 sm:h-12 w-auto object-contain dark:hidden"
              />
            </div>

            <p className="text-[13px] sm:text-sm text-[#555C68] dark:text-[#C1C4CC] leading-relaxed max-w-sm mb-6">
              A premium chess coaching and learning platform for students, parents, and competitive chess players.<br />
              Building international champions since 2018.
            </p>

            {/* select-text so visitors can copy the phone number / email */}
            <div className="flex flex-col gap-3 text-[13px] sm:text-sm text-[#555C68] dark:text-[#C1C4CC] mb-8 select-text">
              <a href={`tel:+${ACADEMY_PHONE.replace(/\D/g, "")}`} className="flex items-center gap-3 hover:text-[#C88E2B] dark:hover:text-[#E2B355] transition-colors">
                <Phone className="size-4 shrink-0 text-[#C88E2B] dark:text-[#E2B355]" />
                {ACADEMY_PHONE.replace("-", " ")}
              </a>
              <a href={`mailto:${ACADEMY_EMAIL}`} className="flex items-center gap-3 hover:text-[#C88E2B] dark:hover:text-[#E2B355] transition-colors">
                <Mail className="size-4 shrink-0 text-[#C88E2B] dark:text-[#E2B355]" />
                {ACADEMY_EMAIL}
              </a>
              <span className="flex items-center gap-3">
                <Globe className="size-4 shrink-0 text-[#C88E2B] dark:text-[#E2B355]" />
                Online Worldwide Classes
              </span>
            </div>

            {/* Social Icons */}
            {socialLinks.length > 0 ? (
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className="size-9 rounded-full bg-[#F8FAFC] dark:bg-[#1E293B] border border-[#E5E9F0] dark:border-white/5 flex items-center justify-center text-[#475569] dark:text-[#94A3B8] hover:text-[#C88E2B] hover:border-[#C88E2B] dark:hover:text-[#E2B355] dark:hover:border-[#E2B355] transition-all duration-200"
                  aria-label={social.label}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <social.Icon className="size-4" />
                </a>
              ))}
            </div>
            ) : null}
          </div>

          {/* Links Columns */}
          <div className="md:col-span-12 lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-0 sm:gap-6 mt-4 md:mt-0">
            <FooterColumn
              id="quick"
              title="Quick Links"
              links={quickLinks}
              isOpen={openSection === "quick"}
              onToggle={() => toggleSection("quick")}
              className="border-b sm:border-b-0 border-[#E5E9F0] dark:border-white/10"
            />
            <FooterColumn
              id="programs"
              title="Programs"
              links={programLinks}
              isOpen={openSection === "programs"}
              onToggle={() => toggleSection("programs")}
              className="border-b sm:border-b-0 border-[#E5E9F0] dark:border-white/10"
            />
            <FooterColumn
              id="support"
              title="Support"
              links={supportLinks}
              isOpen={openSection === "support"}
              onToggle={() => toggleSection("support")}
            />
          </div>
        </div>

        {/* ================= FOOTER BOTTOM BAR ================= */}
        <div className="mt-12 pt-6 border-t border-[#E5E9F0] dark:border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <p className="text-[12px] sm:text-[13px] text-[#555C68] dark:text-[#9BA4B5]">
            © {new Date().getFullYear()} NEXA Chess Academy. All Rights Reserved.
          </p>

          <div className="flex items-center gap-4 sm:gap-6 text-[12px] sm:text-[13px] text-[#555C68] dark:text-[#9BA4B5]">
            <Link href="/privacy" className="hover:text-[#C88E2B] dark:hover:text-[#E2B355] transition-colors">
              Privacy Policy
            </Link>
            <span className="text-[#CBD5E1] dark:text-white/20" aria-hidden="true">|</span>
            <Link href="/terms" className="hover:text-[#C88E2B] dark:hover:text-[#E2B355] transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>

      </div>
    </footer>
  );
}