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

/** "#4278CE" -> "66 120 206", the channel form Tailwind alpha modifiers need. */
export function hexToRgbChannels(hex: string): string | null {
  const value = hex.trim().replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }

  const int = parseInt(full, 16);

  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}
