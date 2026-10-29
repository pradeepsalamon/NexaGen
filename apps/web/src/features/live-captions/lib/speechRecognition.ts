// Minimal typing for the Web Speech API's SpeechRecognition, which TypeScript's
// DOM lib doesn't declare. Chrome ships it prefixed (webkitSpeechRecognition)
// and sends the audio to Google's recognition service. The experimental
// on-device mode (`processLocally`, `SpeechRecognition.available()` with it)
// is deliberately not used: in Chromium 151 both crash the tab's renderer, and
// it has no Tamil anyway.

export type SpeechRecognitionErrorCode =
  | "aborted"
  | "audio-capture"
  | "bad-grammar"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed";

export interface SpeechRecognitionErrorEventLike extends Event {
  error: SpeechRecognitionErrorCode;
  message?: string;
}

export interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onstart: ((event: Event) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Errors a restart can't fix: stop instead of looping. */
export const FATAL_SPEECH_ERRORS: ReadonlySet<SpeechRecognitionErrorCode> = new Set([
  "audio-capture",
  "bad-grammar",
  "language-not-supported",
  "not-allowed",
  "service-not-allowed"
]);

export const SPEECH_ERROR_MESSAGES: Record<SpeechRecognitionErrorCode, string> = {
  aborted: "Recognition was stopped.",
  "audio-capture": "No microphone was found, or another app is holding it.",
  "bad-grammar": "The browser rejected the recognition settings.",
  "language-not-supported": "This browser can't recognise the chosen language.",
  network: "The browser couldn't reach its speech service.",
  "no-speech": "No speech was heard.",
  "not-allowed": "Microphone access was blocked. Allow it in the address bar and try again.",
  "service-not-allowed": "The browser's speech service is turned off or unavailable (Edge often refuses it; use Chrome)."
};
