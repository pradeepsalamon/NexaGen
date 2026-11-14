/**
 * The four brand hues, each with one fixed meaning:
 *   primary   classes, scheduling, primary actions
 *   accent    success, attendance, announcements
 *   secondary practice, assignments, attention
 *   warm      courses, learning, recordings
 * Danger stays reserved for destructive actions and the LIVE state.
 *
 * Every value is a literal class string — Tailwind cannot see interpolated names.
 */
export type Tone = "accent" | "primary" | "secondary" | "warm";

type ToneStyle = {
  /** solid hue, for rules and progress fills */
  bar: string;
  /** soft filled square behind an icon */
  chip: string;
  /** hairline border in the hue */
  border: string;
  /** oversized decorative glyph behind tile content */
  ghost: string;
  /** row hover wash */
  hover: string;
  /** whisper-tint panel header */
  header: string;
  /** readable text weight of the hue */
  text: string;
  /** tile background wash */
  wash: string;
};

export const TONE: Record<Tone, ToneStyle> = {
  accent: {
    bar: "bg-accent",
    chip: "bg-accent/25 text-accent-ink",
    border: "border-accent/30",
    ghost: "text-accent/25",
    hover: "hover:bg-accent/10",
    header: "bg-accent/[0.06]",
    text: "text-accent-ink",
    wash: "bg-accent/[0.08]"
  },
  primary: {
    bar: "bg-primary",
    chip: "bg-primary/[0.12] text-primary-ink",
    border: "border-primary/25",
    ghost: "text-primary/[0.12]",
    hover: "hover:bg-primary/[0.06]",
    header: "bg-primary/[0.05]",
    text: "text-primary-ink",
    wash: "bg-primary/[0.06]"
  },
  secondary: {
    bar: "bg-secondary",
    chip: "bg-secondary/30 text-secondary-ink",
    border: "border-secondary/35",
    ghost: "text-secondary/30",
    hover: "hover:bg-secondary/10",
    header: "bg-secondary/[0.07]",
    text: "text-secondary-ink",
    wash: "bg-secondary/[0.09]"
  },
  warm: {
    bar: "bg-warm",
    chip: "bg-warm/30 text-warm-ink",
    border: "border-warm/35",
    ghost: "text-warm/30",
    hover: "hover:bg-warm/10",
    header: "bg-warm/[0.07]",
    text: "text-warm-ink",
    wash: "bg-warm/[0.09]"
  }
};
