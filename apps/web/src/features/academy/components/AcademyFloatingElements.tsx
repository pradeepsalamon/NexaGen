"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ArrowUp } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { ACADEMY_WHATSAPP } from "../content";

// The number lives once in content.ts (the contact section and JSON-LD use it too).
const WHATSAPP_CHAT_HREF = `https://wa.me/${ACADEMY_WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent("Hi! I'm interested in chess classes")}`;

export function AcademyFloatingElements() {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setShowBackToTop((prev) => {
          const next = window.scrollY > 500;
          return prev === next ? prev : next;
        });
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* Floating WhatsApp button */}
      <a
        href={WHATSAPP_CHAT_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-50 w-12 h-12 md:w-14 md:h-14 rounded-full bg-success flex items-center justify-center text-on-success text-2xl shadow-lg shadow-success/30 hover:shadow-success/50 transition-all duration-300 hover:scale-110 active:scale-95 animate-[academy-float_6s_ease-in-out_infinite]"
        aria-label="Chat on WhatsApp"
      >
        <Image
          src="/academy/WhatsApp-Logo.wine.svg"
          alt="WhatsApp Logo"
          width={56}
          height={56}
          className="w-full h-full object-cover rounded-full"
        />
      </a>

      {/* Floating Book Now action */}
      <SimpleTooltip label="Book a Free Demo" side="left">
        <a
          href="#demo"
          className="fixed bottom-20 md:bottom-[6.5rem] right-4 md:right-6 z-50 size-12 md:size-14 rounded-full bg-accent text-on-accent shadow-md hover:bg-accent-hover flex flex-col items-center justify-center gap-0.5 transition-transform duration-200 hover:scale-105 active:scale-95"
          aria-label="Book a Free Demo"
        >
          <svg
            className="size-5 md:size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
          </svg>
          <span className="text-[7px] md:text-[8px] font-extrabold tracking-wider leading-none">DEMO</span>
        </a>
      </SimpleTooltip>

      {/* Back to top button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-6 left-6 z-50 size-11 rounded-full bg-app-surface border border-app-border hover:border-accent flex items-center justify-center text-app-text hover:text-accent-ink shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 ${
          showBackToTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
        }`}
        aria-hidden={!showBackToTop}
        aria-label="Back to top"
        tabIndex={showBackToTop ? undefined : -1}
      >
        <ArrowUp className="size-5" strokeWidth={2} />
      </button>
    </>
  );
}
