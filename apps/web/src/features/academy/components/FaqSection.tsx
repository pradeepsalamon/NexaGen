import { ChevronDown } from "lucide-react";
import { ACADEMY_FAQ } from "../content";

/**
 * Plain <details>: every answer is in the server HTML (crawlers and AI
 * assistants read it without running JS) and it works with no script at all.
 * The same entries are the page's FAQPage JSON-LD (lib/structuredData.ts).
 */
export function FaqSection() {
  return (
    <section id="faq" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 chess-pattern opacity-15" />
      <div className="absolute inset-0 mesh-soft" />
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="section-head mb-12 reveal reveal-up">
          <span className="eyebrow mb-5">
            <span className="eyebrow-dot" />
            FAQ
          </span>
          <h2 className="section-title font-[family-name:var(--font-playfair)] mb-4">
            Online Chess Classes: <span className="gold-text">Your Questions</span>
          </h2>
          <p className="section-sub">Everything parents and players ask before their first class</p>
        </div>

        <div className="space-y-3">
          {ACADEMY_FAQ.map((item) => (
            <details key={item.question} className="group u-card p-5 sm:p-6 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                <h3 className="text-base sm:text-lg font-bold font-[family-name:var(--font-playfair)] text-text-primary">
                  {item.question}
                </h3>
                <ChevronDown
                  aria-hidden="true"
                  className="w-5 h-5 shrink-0 text-gold transition-transform duration-300 group-open:rotate-180"
                  strokeWidth={2.5}
                />
              </summary>
              <p className="mt-3 text-sm sm:text-base text-text-secondary leading-relaxed">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
