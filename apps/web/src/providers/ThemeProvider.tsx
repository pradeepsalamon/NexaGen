"use client";

import {
  createContext,
  startTransition,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ThemeMode, ThemePreference } from "../constants/theme";
import { runThemeReveal, type ThemeRevealOrigin } from "../lib/theme/themeReveal";

type ThemeContextValue = {
  isHydrated: boolean;
  /** The theme on screen. */
  mode: ThemeMode;
  /** What was picked: light, dark, or follow the device. */
  preference: ThemePreference;
  /** With an `origin` (see `revealOriginOf`) the new theme grows out of that point. */
  setPreference: (preference: ThemePreference, origin?: ThemeRevealOrigin) => void;
  toggleMode: (origin?: ThemeRevealOrigin) => void;
};

const STORAGE_KEY = "nexa-chess-theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Colours come only from globals.css; older saves may still carry a `colors` key, which is ignored.
// Saves from before the "system" option have only `mode`. The root layout's init script reads the same shape.
function getStoredPreference(): ThemePreference {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      mode?: ThemeMode;
      preference?: ThemePreference;
    };
    if (parsed.preference === "system") return "system";
    return (parsed.preference ?? parsed.mode) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

function resolveMode(preference: ThemePreference): ThemeMode {
  if (preference !== "system") return preference;
  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
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
  const [preference, setPreferenceState] = useState<ThemePreference>("light");
  const [mode, setMode] = useState<ThemeMode>("light");

  const targetModeRef = useRef<ThemeMode>("light");

  const adopt = useCallback((next: ThemePreference) => {
    const resolved = resolveMode(next);
    targetModeRef.current = resolved;
    applyMode(resolved);
    setPreferenceState(next);
    setMode(resolved);
  }, []);

  useEffect(() => {
    adopt(getStoredPreference());
    setIsHydrated(true);
  }, [adopt]);

  useEffect(() => {
    function syncStoredMode(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) {
        return;
      }

      adopt(getStoredPreference());
    }

    window.addEventListener("storage", syncStoredMode);

    return () => {
      window.removeEventListener("storage", syncStoredMode);
    };
  }, [adopt]);

  // Following the device: change with it (e.g. its own day/night schedule).
  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia(SYSTEM_DARK_QUERY);
    const onChange = () => adopt("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [adopt, preference]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    applyMode(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, preference }));
    } catch {
      /* storage unavailable */
    }
  }, [isHydrated, mode, preference]);

  // The page repaints from the click itself; React's own update (toggle icon
  // state, toasts, charts) follows at low priority so it never delays that paint.
  // A click on a theme control passes its position and the new theme grows out
  // of it (`runThemeReveal`); the palette is still swapped once, by `applyMode`.
  // The reveal may apply a frame late, so it reads the latest pick from the ref.
  const setPreference = useCallback((next: ThemePreference, origin?: ThemeRevealOrigin) => {
    const resolved = resolveMode(next);
    targetModeRef.current = resolved;
    const changes = document.documentElement.dataset.theme !== resolved;
    runThemeReveal(changes ? origin : undefined, () => applyMode(targetModeRef.current));
    startTransition(() => {
      setPreferenceState(next);
      setMode(resolved);
    });
  }, []);

  const toggleMode = useCallback(
    (origin?: ThemeRevealOrigin) => {
      setPreference(targetModeRef.current === "dark" ? "light" : "dark", origin);
    },
    [setPreference]
  );

  const value = useMemo(
    () => ({ isHydrated, mode, preference, setPreference, toggleMode }),
    [isHydrated, mode, preference, setPreference, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return context;
}
