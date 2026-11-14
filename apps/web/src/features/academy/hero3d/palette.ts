import { Color } from "three";

/**
 * Colours of the 3D hero scene, per theme. These are lit material colours in a
 * WebGL scene, not interface colours, so they are literals (docs/UI_RULES.md §1).
 * Gold barely changes between themes: it is the brand.
 */
const c = (hex: string) => new Color(hex);

export const LIGHT = {
  backing: c("#3A4260"),
  boardTint: c("#FFFFFF"),
  dust: c("#D3A03A"),
  ebony: c("#151A26"),
  eye: c("#0B0D14"),
  frame: c("#18223F"),
  glow: c("#FFC25A"),
  gold: c("#E2AE45"),
  hemiGround: c("#D9C79F"),
  hemiSky: c("#FFF3DA"),
  key: c("#FFF0D2"),
  rim: c("#C3D3FF"),
  shadow: c("#2B3350")
};

export const DARK = {
  backing: c("#05070D"),
  boardTint: c("#8389AE"),
  dust: c("#FFDB8F"),
  ebony: c("#1C1F30"),
  eye: c("#05060B"),
  frame: c("#0B0E17"),
  glow: c("#FFBE55"),
  gold: c("#EBBC57"),
  hemiGround: c("#161326"),
  hemiSky: c("#56608C"),
  key: c("#FFD9A0"),
  rim: c("#8A84D6"),
  shadow: c("#000000")
};

/** Painted once into the board texture; the theme only tints it (`boardTint`). */
export const BOARD_PAINT = {
  dark: "#18244A",
  darkVein: "#8EA2DC",
  groove: "#070B17",
  light: "#FBF4E6",
  lightVein: "#7D6A4C"
};

/** The baked studio the metal reflects. */
export const STUDIO = {
  backLight: "#FFC766",
  bottom: "#251C14",
  coolStrip: "#CFDCFF",
  floorBounce: "#FFE6BD",
  horizon: "#A8957A",
  keyBox: "#FFF2D9",
  strip: "#FFFFFF",
  top: "#FFF1D8"
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
