"use client";

import {
  createContext,
  startTransition,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { ThemeMode } from "../constants/theme";

type ThemeContextValue = {
  isHydrated: boolean;
  mode: ThemeMode;
  toggleMode: () => void;
};

const STORAGE_KEY = "nexa-chess-theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Colours come only from globals.css; older saves may still carry a `colors` key, which is ignored.
function getStoredMode(): ThemeMode {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      mode?: ThemeMode;
    };
    return parsed.mode === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

// Swaps the palette in one paint: otherwise every `transition-colors` element
// animates the change on its own, repainting the whole page for ~300ms.
// The freeze rule stays until the new theme has painted (two frames): removing
// it in the same task forced a second whole-page style pass before the first
// paint, which is what made the toggle feel laggy on phones.
function applyMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (root.dataset.theme === mode) return;
  const freeze = document.createElement("style");
  freeze.textContent =
    "*:not([data-theme-keep-transition]),*::before,*::after{transition:none!important}";
  document.head.appendChild(freeze);
  root.dataset.theme = mode;
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => freeze.remove()));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const storedMode = getStoredMode();
    setMode(storedMode);
    applyMode(storedMode);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    function syncStoredMode(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) {
        return;
      }

      const storedMode = getStoredMode();
      setMode(storedMode);
      applyMode(storedMode);
    }

    window.addEventListener("storage", syncStoredMode);

    return () => {
      window.removeEventListener("storage", syncStoredMode);
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    applyMode(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode }));
    } catch {
      /* storage unavailable */
    }
  }, [isHydrated, mode]);

  // The page repaints from the click itself; React's own update (toggle icon
  // state, toasts, charts) follows at low priority so it never delays that paint.
  const toggleMode = useCallback(() => {
    const next: ThemeMode = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyMode(next);
    startTransition(() => setMode(next));
  }, []);

  const value = useMemo(() => ({ isHydrated, mode, toggleMode }), [isHydrated, mode, toggleMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return context;
}
