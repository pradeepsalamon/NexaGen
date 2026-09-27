import {
  Atkinson_Hyperlegible,
  Inter,
  Jost,
  Lato,
  Lexend,
  Nunito_Sans,
  Outfit,
  Plus_Jakarta_Sans
} from "next/font/google";

// One loader per FONT_CATALOG entry (@nexa-chess/types); `variable` must be
// `--font-<FontId>`. Only the two defaults preload — the rest download the
// first time a user's resolved typography actually references them.
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito-sans", display: "swap" });
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap", preload: false });
const lato = Lato({
  subsets: ["latin"],
  variable: "--font-lato",
  weight: ["400", "700", "900"],
  display: "swap",
  preload: false
});
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
  preload: false
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend", display: "swap", preload: false });
const atkinsonHyperlegible = Atkinson_Hyperlegible({
  subsets: ["latin"],
  variable: "--font-atkinson-hyperlegible",
  weight: ["400", "700"],
  display: "swap",
  preload: false
});

/** Put on <html> so every `--font-<id>` variable is defined app-wide. */
export const fontVariables = [
  outfit,
  nunitoSans,
  jost,
  lato,
  plusJakartaSans,
  inter,
  lexend,
  atkinsonHyperlegible
]
  .map((font) => font.variable)
  .join(" ");
