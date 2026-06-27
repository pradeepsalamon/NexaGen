"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  DEFAULT_THEME_COLORS,
  type CustomThemeColors,
  type ThemeMode
} from "../constants/theme";

type ThemeContextValue = {
  colors: CustomThemeColors;
  mode: ThemeMode;
  resetColors: () => void;
  setColor: (name: keyof CustomThemeColors, value: string) => void;
  toggleMode: () => void;
};

type StoredTheme = {
  colors?: Partial<CustomThemeColors>;
  mode?: ThemeMode;
};

const STORAGE_KEY = "nexagen-chess-theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(mode: ThemeMode, colors: CustomThemeColors) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.setProperty("--color-primary", colors.primary);
  root.style.setProperty("--color-secondary", colors.secondary);
  root.style.setProperty("--color-accent", colors.accent);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [colors, setColors] = useState<CustomThemeColors>({
    primary: DEFAULT_THEME_COLORS.primary,
    secondary: DEFAULT_THEME_COLORS.secondary,
    accent: DEFAULT_THEME_COLORS.accent
  });

  useEffect(() => {
    const defaultColors = {
      primary: DEFAULT_THEME_COLORS.primary,
      secondary: DEFAULT_THEME_COLORS.secondary,
      accent: DEFAULT_THEME_COLORS.accent
    };
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);

    if (!savedTheme) {
      applyTheme("light", defaultColors);
      return;
    }

    try {
      const parsed = JSON.parse(savedTheme) as StoredTheme;
      const nextMode = parsed.mode === "dark" ? "dark" : "light";
      const nextColors = {
        primary: parsed.colors?.primary ?? DEFAULT_THEME_COLORS.primary,
        secondary: parsed.colors?.secondary ?? DEFAULT_THEME_COLORS.secondary,
        accent: parsed.colors?.accent ?? DEFAULT_THEME_COLORS.accent
      };

      setMode(nextMode);
      setColors(nextColors);
      applyTheme(nextMode, nextColors);
    } catch {
      applyTheme("light", defaultColors);
    }
  }, []);

  useEffect(() => {
    applyTheme(mode, colors);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ colors, mode }));
  }, [colors, mode]);

  const resetColors = useCallback(() => {
    setColors({
      primary: DEFAULT_THEME_COLORS.primary,
      secondary: DEFAULT_THEME_COLORS.secondary,
      accent: DEFAULT_THEME_COLORS.accent
    });
  }, []);

  const setColor = useCallback(
    (name: keyof CustomThemeColors, value: string) => {
      setColors((currentColors) => ({ ...currentColors, [name]: value }));
    },
    []
  );

  const toggleMode = useCallback(() => {
    setMode((currentMode) => (currentMode === "light" ? "dark" : "light"));
  }, []);

  const value = useMemo(
    () => ({ colors, mode, resetColors, setColor, toggleMode }),
    [colors, mode, resetColors, setColor, toggleMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return context;
}
