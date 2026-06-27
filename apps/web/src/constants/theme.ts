export const DEFAULT_THEME_COLORS = {
  primary: "#4278CE",
  secondary: "#FFCC00",
  accent: "#98D9B6",
  warm: "#FFB691"
} as const;

export type ThemeMode = "light" | "dark";

export type CustomThemeColors = {
  primary: string;
  secondary: string;
  accent: string;
};
