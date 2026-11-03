"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ACADEMY_FAQ } from "../content";
import { Section, SectionHeader } from "./parts";

const FAQ_IMG_LIGHT = "/faq/faq_light.webp";
const FAQ_IMG_DARK = "/faq/faq_dark.webp";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <Section id="faq" labelledBy="faq-heading" tone="surface">
      <SectionHeader
        description="Find answers to common questions about our programs, coaching, and trial classes."
        eyebrow="Frequently asked"
        id="faq-heading"
        title="Online chess classes: your questions"
      />

      <div className="mt-12 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <ul className="grid gap-3 lg:col-span-8 lg:col-start-1">
          {ACADEMY_FAQ.map((item, index) => {
            const isOpen = openIndex === index;
            const panelId = `faq-panel-${index}`;
            const buttonId = `faq-button-${index}`;
            return (
              <li
                className={cn(
                  "rounded-app border bg-app-background transition-colors",
                  isOpen ? "border-primary" : "border-app-border"
                )}
                key={item.question}
              >
                <h3>
                  <button
                    aria-controls={panelId}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 rounded-app px-5 py-4 text-left text-base font-semibold text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
                    id={buttonId}
                    onClick={() => setOpenIndex((prev) => (prev === index ? null : index))}
                    type="button"
                  >
                    {item.question}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("size-5 shrink-0 text-app-muted transition-transform motion-reduce:transition-none", isOpen && "rotate-180")}
                      strokeWidth={2.25}
                    />
                  </button>
                </h3>
                {/* Stays in the DOM when closed (grid 0fr), so the answers are still on the page. */}
                <div
                  aria-labelledby={buttonId}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                  id={panelId}
                  role="region"
                >
                  <div className={cn("min-h-0 overflow-hidden", !isOpen && "invisible")}>
                    <p className="px-5 pb-5 text-sm text-app-muted">{item.answer}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="grid gap-4 rounded-panel border border-app-border bg-app-background p-6 lg:col-span-4">
          <div aria-hidden="true" className="relative hidden h-40 lg:block">
            <Image alt="" className="object-contain dark:hidden" fill sizes="280px" src={FAQ_IMG_LIGHT} />
            <Image alt="" className="hidden object-contain dark:block" fill sizes="280px" src={FAQ_IMG_DARK} />
          </div>
          <h3 className="text-lg font-bold text-app-text">Still have a question?</h3>
          <p className="text-sm text-app-muted">Our team is here to help you. Get in touch anytime.</p>
          <Button asChild variant="neutral">
            <a href="#contact">
              Contact support
              <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
            </a>
          </Button>
        </aside>
      </div>
    </Section>
  );
}
