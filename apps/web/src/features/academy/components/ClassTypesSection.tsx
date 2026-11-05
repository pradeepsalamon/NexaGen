import Image from "next/image";
import {
  User,
  Users,
  Handshake,
  ArrowRight,
  Check,
  type LucideIcon
} from "lucide-react";
import { ACADEMY_CLASS_FORMATS } from "../content";

// Section background artwork (already in public/academy/)
const SECTION_BG_LIGHT = "/programs/01_chess_reverie_light.webp";
const SECTION_BG_DARK = "/programs/02_chess_reverie_dark.webp";

// Update these 3 filenames if yours are named differently in public/academy/
const IMG_INDIVIDUAL = "/class/01_gold_king.webp";
const IMG_BATCH = "/class/02_black_gold_pawn.webp";
const IMG_CAMPS = "/class/03_black_gold_rook.webp";

interface LearningOption {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  pieceImage: string;
  features: string[];
  highlight: boolean;
}

// Formats come from content.ts (also published in llms.txt): the names are
// its names and the bullets restate its descriptions, so the page makes no
// claim the structured data doesn't (and the reverse). The subtitles stay one
// short line; a longer one runs under the piece artwork.
const [individualFormat, buddyFormat, groupFormat] = ACADEMY_CLASS_FORMATS;

const learningOptions: LearningOption[] = [
  {
    title: individualFormat.name,
    subtitle: "One-on-one coaching.",
    Icon: User,
    pieceImage: IMG_INDIVIDUAL,
    features: ["One-on-one coaching", "Personalised attention", "Flexible timing", "A custom curriculum"],
    highlight: false
  },
  {
    title: buddyFormat.name,
    subtitle: "Learn together with friends.",
    Icon: Handshake,
    pieceImage: IMG_BATCH,
    features: ["Learn together with friends", "Interactive and fun", "A friendly competitive setting"],
    highlight: true
  },
  {
    title: groupFormat.name,
    subtitle: "Coaching in a group.",
    Icon: Users,
    pieceImage: IMG_CAMPS,
    features: ["Collaborative coaching", "Affordable", "Team activities"],
    highlight: false
  }
];

export function ClassTypesSection() {

  return (
    <section
      id="class-types"
      className="relative py-16 sm:py-24 overflow-hidden select-none transition-colors duration-300 bg-app-background text-app-text"
    >
      {/* ================= SECTION BACKGROUND ARTWORK ================= */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Light Mode Twin Knights Background */}
        <Image
          src={SECTION_BG_LIGHT}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-top dark:hidden"
        />

        {/* Dark Mode Twin Knights Background */}
        <Image
          src={SECTION_BG_DARK}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-top hidden dark:block"
        />

        {/* Smooth Top & Bottom Section Blend */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-app-surface/40 via-transparent to-app-background/95"
          aria-hidden="true"
        />
      </div>

      {/* ================= FOREGROUND CONTAINER ================= */}
      <div className="relative z-10 max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          {/* Pill Eyebrow: [• LEARNING FORMATS] */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] mb-4 shadow-2xs backdrop-blur-md bg-app-surface/90 border-app-border text-app-text"
          >
            <span className="size-2 rounded-full bg-accent" />
            <span>LEARNING FORMATS</span>
          </div>

          {/* Two-Tone Serif Heading */}
          <h2 className="font-[family-name:var(--font-playfair)] font-bold text-3xl sm:text-4xl lg:text-[46px] leading-[1.12] tracking-[-0.02em] mb-3.5">
            <span className="text-app-text">
              Flexible Learning{" "}
            </span>
            <span className="block sm:inline text-accent-ink">
              Options
            </span>
          </h2>

          {/* Subtitle */}
          <p
            className="text-sm sm:text-base lg:text-[17px] leading-relaxed text-app-muted"
          >
            Choose a format tailored to your schedule, learning pace, and
            competitive goals.
          </p>
        </div>

        {/* ================= 3 LEARNING FORMAT CARDS ================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 lg:gap-7 items-stretch">
          {learningOptions.map((opt) => {
            const isHighlighted = opt.highlight;
            const Icon = opt.Icon;

            const cardSurfaceClass = isHighlighted
              ? "bg-app-surface/95 border-accent ring-1 ring-accent/40 shadow-[0_18px_45px_-12px_rgb(var(--rgb-accent)/0.25)]"
              : "bg-app-surface/95 border-app-border hover:border-accent/60 shadow-[0_14px_36px_-10px_rgb(var(--rgb-brand-800)/0.08)]";

            const iconBoxClass = "bg-accent-soft border-accent/45 text-accent-ink";

            return (
              <div
                key={opt.title}
                className={`group relative flex flex-col rounded-[22px] border backdrop-blur-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 ${cardSurfaceClass}`}
              >
                {/* RIGHT-SIDE 3D PIECE ARTWORK LAYER */}
                <div
                  className="
                    pointer-events-none absolute top-0 right-0 bottom-14
                    w-[46%] sm:w-[48%] z-0 overflow-hidden select-none
                  "
                  style={{
                    WebkitMaskImage:
                      "linear-gradient(to right, transparent 0%, black 38%, black 100%), linear-gradient(to top, transparent 0%, black 18%, black 100%)",
                    WebkitMaskComposite: "source-in",
                    maskImage:
                      "linear-gradient(to right, transparent 0%, black 38%, black 100%), linear-gradient(to top, transparent 0%, black 18%, black 100%)",
                    maskComposite: "intersect"
                  }}
                >
                  <Image
                    src={opt.pieceImage}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 180px, 220px"
                    className="object-cover object-[58%_center] scale-110 transition-transform duration-500 group-hover:scale-115 brightness-100"
                  />
                  {/* Extra Dark Mode Tint so bright JPEG skies blend seamlessly into dark navy cards */}
                  <div
                    className="absolute inset-0 hidden bg-gradient-to-r from-app-surface via-app-surface/35 to-transparent mix-blend-multiply dark:block"
                    aria-hidden="true"
                  />
                </div>

                {/* FOREGROUND CARD BODY */}
                <div className="relative z-10 p-5 sm:p-7 flex flex-col flex-1">
                  {/* Header: Side-by-side on Mobile, Stacked on Desktop (Exact match to mockup) */}
                  <div className="flex items-start md:flex-col gap-3.5 md:gap-0 mb-4 sm:mb-5 pr-16 md:pr-12">
                    <div
                      className={`size-10 sm:size-12 rounded-[12px] border flex items-center justify-center shrink-0 md:mb-5 transition-transform duration-200 group-hover:scale-105 ${iconBoxClass}`}
                    >
                      <Icon className="size-5 sm:size-[22px]" strokeWidth={2} />
                    </div>

                    <div>
                      <h3
                        className="font-[family-name:var(--font-playfair)] font-bold text-xl sm:text-2xl leading-tight mb-1 sm:mb-1.5 text-app-text"
                      >
                        {opt.title}
                      </h3>

                      <p
                        className="text-xs sm:text-[13.5px] leading-snug text-app-muted"
                      >
                        {opt.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Feature Checklist */}
                  <ul className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-7 flex-1 pr-20 sm:pr-24">
                    {opt.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-xs sm:text-[13px] font-medium leading-snug text-app-muted"
                      >
                        {/* Solid Gold Circle with White Checkmark */}
                        <span className="mt-0.5 size-4 rounded-full bg-gradient-to-b from-accent to-accent-hover text-on-accent flex items-center justify-center shrink-0 shadow-2xs">
                          <Check className="size-2.5 stroke-[3.2]" />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Bottom CTA Button */}
                  <a
                    aria-label={`${opt.title}: book a free demo class`}
                    href="#demo"
                    className={`w-full h-10 sm:h-11 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5 ${isHighlighted
                        ? "bg-gradient-to-r from-accent via-accent to-accent-hover hover:from-accent hover:to-accent-hover text-on-accent shadow-[0_6px_20px_rgb(var(--rgb-accent)/0.35)]"
                        : "bg-app-surface hover:bg-app-background text-app-text border border-app-border hover:border-accent"
                      }`}
                  >
                    <span>Learn More</span>
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