import { create } from "zustand";
import {
  DEFAULT_TRANSCRIPT_LANGUAGE,
  transcriptLanguageSchema,
  type TranscriptLanguage,
} from "@nexa-chess/types";

/**
 * What the in-room transcript is doing, as the coach sees it. Written by
 * `TranscriptBridge` (the one place that runs recognition), read by the
 * settings panel.
 */
export type TranscriptRunState =
  | "off"
  | "unsupported"
  | "needs-consent"
  | "paused"
  | "mic-off"
  | "starting"
  | "listening"
  | "error";

const PREFS_KEY = "nexa-live-class-transcript";

type Prefs = { lang: TranscriptLanguage; paused: boolean };

function loadPrefs(): Prefs {
  const fallback: Prefs = { lang: DEFAULT_TRANSCRIPT_LANGUAGE, paused: false };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    const lang = transcriptLanguageSchema.safeParse(raw.lang);
    return { lang: lang.success ? lang.data : fallback.lang, paused: raw.paused === true };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode / storage full: the choice lasts for this tab only.
  }
}

type TranscriptState = Prefs & {
  consentDialogOpen: boolean;
  error: string | null;
  /** Bumped by "Try again": the bridge clears its error and restarts. */
  retryToken: number;
  runState: TranscriptRunState;
  /** Lines the API has stored from this tab. */
  savedLines: number;
  addSavedLines: (count: number) => void;
  retry: () => void;
  setConsentDialogOpen: (open: boolean) => void;
  setLang: (lang: TranscriptLanguage) => void;
  setPaused: (paused: boolean) => void;
  setRun: (runState: TranscriptRunState, error?: string | null) => void;
};

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  ...loadPrefs(),
  consentDialogOpen: false,
  error: null,
  retryToken: 0,
  runState: "off",
  savedLines: 0,
  addSavedLines: (count) => set((state) => ({ savedLines: state.savedLines + count })),
  retry: () => set((state) => ({ retryToken: state.retryToken + 1 })),
  setConsentDialogOpen: (consentDialogOpen) => set({ consentDialogOpen }),
  setLang: (lang) => {
    set({ lang });
    savePrefs({ lang, paused: get().paused });
  },
  setPaused: (paused) => {
    set({ paused });
    savePrefs({ lang: get().lang, paused });
  },
  setRun: (runState, error = null) => {
    const current = get();
    if (current.runState !== runState || current.error !== error) set({ error, runState });
  },
}));
