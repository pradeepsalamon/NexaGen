import Image from "next/image";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { ACADEMY_PROGRAMS } from "../content";

const SECTION_BG_LIGHT = "/programs/01_chess_reverie_light.webp";
const SECTION_BG_DARK = "/programs/02_chess_reverie_dark.webp";

type PieceType = "pawn" | "knight" | "king";

interface ProgramItem {
  level: string;
  subtitle: string;
  pieceType: PieceType;
  pieceImage: string;
  features: string[];
  tag: string;
  featured: boolean;
}

const programPresentation: Omit<ProgramItem, "features">[] = [
  {
    level: "Beginner Level",
    subtitle: "For students starting their chess journey.",
    pieceType: "pawn",
    pieceImage: "/programs/01_gold_pawn.webp",
    tag: "Foundation",
    featured: false
  },
  {
    level: "Intermediate Level",
    subtitle: "For players ready to improve their game.",
    pieceType: "knight",
    pieceImage: "/programs/02_gold_knight.webp",
    tag: "Most Popular",
    featured: true
  },
  {
    level: "Advanced Level",
    subtitle: "For serious competitive players.",
    pieceType: "king",
    pieceImage: "/programs/03_black_gold_king.webp",
    tag: "Mastery",
    featured: false
  }
];

// The topics come from content.ts, the same list the JSON-LD and llms.txt
// publish, so the page never claims less (or more) than the structured data.
const programs: ProgramItem[] = programPresentation.map((program) => ({
  ...program,
  features: ACADEMY_PROGRAMS.find((p) => p.level === program.level)?.topics ?? []
}));

function ChessCornerIcon({ type }: { type: PieceType }) {
  const colorClass = "text-app-text";

  if (type === "pawn") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`size-6 ${colorClass}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="5.5" r="3.2" />
        <path d="M9 9.5h6c.6 0 1 .4 1 1s-.4 1-1 1h-.6l1.3 5.5H8.3l1.3-5.5H9c-.6 0-1-.4-1-1s.4-1 1-1z" />
        <path d="M6.5 18.2h11c.8 0 1.5.7 1.5 1.5v.8H5v-.8c0-.8.7-1.5 1.5-1.5z" />
      </svg>
    );
  }

  if (type === "knight") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`size-6 ${colorClass}`}
        aria-hidden="true"
      >
        <path d="M16.5 3.5c-1.4 0-2.6.6-3.5 1.4L11 4l-.8 2.2L6.5 9c-.6.5-.8 1.3-.4 2l1 1.6c.4.6 1.2.8 1.9.4l2.2-1.1c.3.9 0 2.1-.8 3.1L8 17.5h8.8c.5-2.6 1.2-5.7 1.2-8.5 0-3-1.2-5.5-1.5-5.5z" />
        <path d="M6.5 18.8h11c.8 0 1.5.6 1.5 1.4v.8H5v-.8c0-.8.7-1.4 1.5-1.4z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`size-6 ${colorClass}`}
      aria-hidden="true"
    >
      <path d="M11.2 2h1.6v2h2v1.6h-2v1.8h-1.6V5.6h-2V4h2V2z" />
      <path d="M6 8.5l2.5 7.5h7L18 8.5l-3.2 2.1L12 7.8l-2.8 2.8L6 8.5z" />
      <path d="M6.5 17.2h11v1.4H6.5v-1.4zm-1 2.4h13c.6 0 1 .4 1 1v.9H4.5v-.9c0-.6.4-1 1-1z" />
    </svg>
  );
}

export function ProgramsSection() {

  return (
    <section
      id="programs"
      className="relative py-16 sm:py-24 overflow-hidden select-none transition-colors duration-300 bg-app-background text-app-text"
    >
      {/* ================= SECTION BACKGROUND ARTWORK ================= */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Light Mode Background (01_chess_reverie_light.png) */}
        <Image
          src={SECTION_BG_LIGHT}
          alt="Nexa Chess Programs Light Background"
          fill
          sizes="100vw"
          className="object-cover object-top dark:hidden"
        />

        {/* Dark Mode Background (02_chess_reverie_dark.png) */}
        <Image
          src={SECTION_BG_DARK}
          alt="Nexa Chess Programs Dark Background"
          fill
          sizes="100vw"
          className="object-cover object-top hidden dark:block"
        />

        {/* Soft Top & Bottom Vignettes so the section blends cleanly */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-app-surface/40 via-transparent to-app-background/95"
          aria-hidden="true"
        />
      </div>

      {/* ================= FOREGROUND CONTAINER ================= */}
      <div className="relative z-10 max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          {/* Pill Eyebrow: [• OUR PROGRAMS] */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] mb-4 shadow-2xs backdrop-blur-md bg-app-surface/90 border-app-border text-app-text"
          >
            <span className="size-2 rounded-full bg-accent" />
            <span>OUR PROGRAMS</span>
          </div>

          {/* Two-Tone Serif Heading */}
          <h2 className="font-[family-name:var(--font-playfair)] font-bold text-3xl sm:text-4xl lg:text-[46px] leading-[1.12] tracking-[-0.02em] mb-3.5">
            <span className="text-app-text">
              Choose Your{" "}
            </span>
            <span className="text-accent-ink">Path</span>
          </h2>

          {/* Subtitle */}
          <p
            className="text-sm sm:text-base lg:text-[17px] leading-relaxed text-app-muted"
          >
            Structured learning paths designed for every stage of your chess
            journey.
          </p>
        </div>

        {/* ================= 3 PROGRAM CARDS GRID ================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-7 items-stretch">
          {programs.map((program) => {
            const isFeatured = program.featured;

            const cardSurfaceClass = isFeatured
              ? "bg-app-surface/95 border-accent ring-1 ring-accent/40 shadow-[0_18px_45px_-12px_rgb(var(--rgb-accent)/0.25)]"
              : "bg-app-surface/95 border-app-border hover:border-accent/60 shadow-[0_14px_36px_-10px_rgb(var(--rgb-brand-800)/0.08)]";

            const tagBadgeClass = isFeatured
              ? "bg-accent-soft text-app-text border-accent/45"
              : "bg-app-soft text-app-text border-app-border";

            return (
              <div
                key={program.level}
                className={`group relative flex flex-col rounded-[22px] border backdrop-blur-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 ${cardSurfaceClass}`}
              >
                {/* ================= CARD BODY ================= */}
                <div className="relative z-10 p-6 sm:p-7 flex flex-col flex-1">
                  {/* Top Row: Tag Pill + Chess Silhouette Icon */}
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold border ${tagBadgeClass}`}
                    >
                      {isFeatured && (
                        <Sparkles
                          className="size-3.5 text-accent-ink"
                          strokeWidth={2.2}
                        />
                      )}
                      <span>{program.tag}</span>
                    </span>

                    <div className="relative z-20 transition-transform duration-200 group-hover:scale-110">
                      <ChessCornerIcon type={program.pieceType} />
                    </div>
                  </div>

                  {/* Level Title */}
                  <h3
                    className="relative z-20 font-[family-name:var(--font-playfair)] font-bold text-2xl sm:text-[26px] leading-tight mb-1.5 text-app-text"
                  >
                    {program.level}
                  </h3>

                  {/* Subtitle */}
                  <p
                    className="relative z-20 text-xs sm:text-[13.5px] mb-5 text-app-muted"
                  >
                    {program.subtitle}
                  </p>

                  {/* Middle Content Area: Features on Left + 3D Chess Piece Artwork on Right */}
                  <div className="relative flex-1 min-h-[195px] sm:min-h-[205px] mb-5 flex items-start">
                    {/* Feature Checklist */}
                    <ul className="relative z-20 space-y-3 pr-24 sm:pr-28">
                      {program.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-center gap-2.5 text-xs sm:text-[13.5px] font-medium leading-snug text-app-muted"
                        >
                          {/* Solid Gold Circle with Checkmark */}
                          <span className="size-4 rounded-full bg-gradient-to-b from-accent to-accent-hover text-on-accent flex items-center justify-center shrink-0 shadow-2xs">
                            <Check className="size-2.5 stroke-[3.2]" />
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* 3D Chess Piece Artwork (Anchored Bottom-Right of the Checklist Area) */}
                    <div
                      className="
                        pointer-events-none absolute -right-6 -bottom-3
                        w-[165px] h-[215px] sm:w-[180px] sm:h-[225px]
                        z-10 select-none overflow-hidden rounded-bl-3xl
                      "
                      style={{
                        WebkitMaskImage:
                          "radial-gradient(ellipse 78% 82% at 68% 58%, black 48%, transparent 96%)",
                        maskImage:
                          "radial-gradient(ellipse 78% 82% at 68% 58%, black 48%, transparent 96%)"
                      }}
                    >
                      <Image
                        src={program.pieceImage}
                        alt={program.level}
                        fill
                        sizes="200px"
                        className="object-cover object-center scale-105 transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>
                  </div>

                  {/* Bottom CTA Button */}
                  <a
                    href="#demo"
                    className={`relative z-20 w-full h-11 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5 ${isFeatured
                      ? "bg-gradient-to-r from-accent via-accent to-accent-hover hover:from-accent hover:to-accent-hover text-on-accent shadow-[0_6px_20px_rgb(var(--rgb-accent)/0.35)]"
                      : "bg-app-surface hover:bg-app-background text-app-text border border-app-border hover:border-accent"
                      }`}
                  >
                    <span>Start Learning</span>
                    <ArrowRight className="size-4 stroke-[2.3]" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}