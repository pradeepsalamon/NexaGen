"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowUp, CalendarDays } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

const FLOATING_BUTTON =
  "fixed z-50 flex size-12 items-center justify-center rounded-full shadow-lift transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus motion-reduce:transition-none md:size-14";

/** WhatsApp and Book a demo on the right, Back to top on the left. */
export function AcademyFloatingElements() {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setShowBackToTop(window.scrollY > 500);
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <SimpleTooltip label="Chat on WhatsApp" side="left">
        <a
          aria-label="Chat on WhatsApp"
          className={cn(FLOATING_BUTTON, "bottom-4 right-4 overflow-hidden bg-success md:bottom-6 md:right-6")}
          href="https://api.whatsapp.com/send?phone=919344967940&text=Hi! I'm interested in chess classes"
          rel="noopener noreferrer"
          target="_blank"
        >
          <Image alt="" className="size-full object-cover" height={56} src="/academy/WhatsApp-Logo.wine.svg" width={56} />
        </a>
      </SimpleTooltip>

      <SimpleTooltip label="Book a free demo" side="left">
        <a
          aria-label="Book a free demo"
          className={cn(FLOATING_BUTTON, "bottom-20 right-4 bg-primary text-on-primary md:bottom-24 md:right-6")}
          href="#demo"
        >
          <CalendarDays aria-hidden="true" className="size-5 md:size-6" strokeWidth={2.25} />
        </a>
      </SimpleTooltip>

      <SimpleTooltip label="Back to top" side="right">
        <button
          aria-hidden={!showBackToTop}
          aria-label="Back to top"
          className={cn(
            FLOATING_BUTTON,
            "bottom-4 left-4 size-11 border border-app-line-strong bg-app-surface text-app-text md:bottom-6 md:left-6 md:size-11",
            showBackToTop ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => window.scrollTo({ behavior: "smooth", top: 0 })}
          tabIndex={showBackToTop ? undefined : -1}
          type="button"
        >
          <ArrowUp aria-hidden="true" className="size-5" strokeWidth={2.25} />
        </button>
      </SimpleTooltip>
    </>
  );
}
