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
  isHydrated: boolean;
  mode: ThemeMode;
  resetColors: () => void;
  setColor: (name: keyof CustomThemeColors, value: string) => void;
  toggleMode: () => void;
};

type StoredTheme = {
  colors?: Partial<CustomThemeColors>;
  mode?: ThemeMode;
};

const STORAGE_KEY = "nexa-chess-theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const defaultColors = {
  primary: DEFAULT_THEME_COLORS.primary,
  secondary: DEFAULT_THEME_COLORS.secondary,
  accent: DEFAULT_THEME_COLORS.accent
};

function getStoredTheme(): {
  colors: CustomThemeColors;
  mode: ThemeMode;
} {
  if (typeof window === "undefined") {
    return {
      colors: defaultColors,
      mode: "light"
    };
  }

  const savedTheme = window.localStorage.getItem(STORAGE_KEY);

  if (!savedTheme) {
    return {
      colors: defaultColors,
      mode: "light"
    };
  }

  try {
    const parsed = JSON.parse(savedTheme) as StoredTheme;

    return {
      colors: {
        primary: parsed.colors?.primary ?? DEFAULT_THEME_COLORS.primary,
        secondary: parsed.colors?.secondary ?? DEFAULT_THEME_COLORS.secondary,
        accent: parsed.colors?.accent ?? DEFAULT_THEME_COLORS.accent
      },
      mode: parsed.mode === "dark" ? "dark" : "light"
    };
  } catch {
    return {
      colors: defaultColors,
      mode: "light"
    };
  }
}

function applyTheme(mode: ThemeMode, colors: CustomThemeColors) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.setProperty("--color-primary", colors.primary);
  root.style.setProperty("--color-secondary", colors.secondary);
  root.style.setProperty("--color-accent", colors.accent);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("light");
  const [colors, setColors] = useState<CustomThemeColors>(defaultColors);

  useEffect(() => {
    const storedTheme = getStoredTheme();

    setMode(storedTheme.mode);
    setColors(storedTheme.colors);
    applyTheme(storedTheme.mode, storedTheme.colors);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    function syncStoredTheme(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) {
        return;
      }

      const storedTheme = getStoredTheme();
      setMode(storedTheme.mode);
      setColors(storedTheme.colors);
      applyTheme(storedTheme.mode, storedTheme.colors);
    }

    window.addEventListener("storage", syncStoredTheme);

    return () => {
      window.removeEventListener("storage", syncStoredTheme);
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    applyTheme(mode, colors);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ colors, mode }));
  }, [colors, isHydrated, mode]);

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
    () => ({ colors, isHydrated, mode, resetColors, setColor, toggleMode }),
    [colors, isHydrated, mode, resetColors, setColor, toggleMode]
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
