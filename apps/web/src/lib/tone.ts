/**
 * The four brand hues, each with one fixed meaning:
 *   primary   classes, scheduling, primary actions
 *   accent    success, attendance, announcements
 *   secondary practice, assignments, attention (amber: gold is never a status)
 *   warm      courses, learning, recordings
 *   reward    rating and streaks (gold)
 * Danger stays reserved for destructive actions and the LIVE state.
 *
 * Every value is a literal class string — Tailwind cannot see interpolated names.
 */
export type Tone = "accent" | "primary" | "reward" | "secondary" | "warm";

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
    bar: "bg-success",
    chip: "bg-success-soft text-success-ink",
    border: "border-success/30",
    ghost: "text-success/25",
    hover: "hover:bg-success/10",
    header: "bg-success/[0.06]",
    text: "text-success-ink",
    wash: "bg-success/[0.08]"
  },
  primary: {
    bar: "bg-primary",
    chip: "bg-primary-soft text-primary-ink",
    border: "border-primary/25",
    ghost: "text-primary/[0.12]",
    hover: "hover:bg-primary/[0.06]",
    header: "bg-primary/[0.05]",
    text: "text-primary-ink",
    wash: "bg-primary/[0.06]"
  },
  reward: {
    bar: "bg-accent",
    chip: "bg-accent-soft text-accent-ink",
    border: "border-accent/40",
    ghost: "text-accent/30",
    hover: "hover:bg-accent/10",
    header: "bg-accent/[0.07]",
    text: "text-accent-ink",
    wash: "bg-accent/[0.09]"
  },
  secondary: {
    bar: "bg-warning",
    chip: "bg-warning-soft text-warning-ink",
    border: "border-warning/35",
    ghost: "text-warning/30",
    hover: "hover:bg-warning/10",
    header: "bg-warning/[0.07]",
    text: "text-warning-ink",
    wash: "bg-warning/[0.09]"
  },
  warm: {
    bar: "bg-primary",
    chip: "bg-primary-soft text-primary-ink",
    border: "border-primary/35",
    ghost: "text-primary/30",
    hover: "hover:bg-primary/10",
    header: "bg-primary/[0.07]",
    text: "text-primary-ink",
    wash: "bg-primary/[0.09]"
  }
};
