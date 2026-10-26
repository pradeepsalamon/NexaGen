"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyChessTermFixes, isEnglishLang } from "../lib/chessTermFixes";
import {
  FATAL_SPEECH_ERRORS,
  getSpeechRecognition,
  SPEECH_ERROR_MESSAGES,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionLike
} from "../lib/speechRecognition";

export type CaptionSegment = {
  id: number;
  /** ms since the session started that the phrase was first heard (first interim result). */
  heardAtMs: number;
  /** ms since the session started that the phrase became final. */
  finalAtMs: number;
  /**
   * ms from the last interim update to the final result: roughly how long the
   * caption waited after the speaker paused. Null when no interim came first.
   */
  finalDelayMs: number | null;
  raw: string;
  text: string;
  /** Null when the browser reports none (Chrome often gives 0 for non-English). */
  confidence: number | null;
};

export type CaptionStatus = "idle" | "starting" | "listening" | "stopping";

export type CaptionOptions = {
  fixChessTerms: boolean;
  lang: string;
};

// Chrome ends a continuous session on its own after silence or about a minute;
// the hook restarts it until stop(). Repeated network failures give up.
const MAX_CONSECUTIVE_FAILURES = 3;
// A browser without a working speech service (plain Chromium, some Edge builds)
// can accept start() and then never start or fail. Give up instead of hanging.
const START_TIMEOUT_MS = 8000;

export function useSpeechCaptions() {
  const [status, setStatus] = useState<CaptionStatus>("idle");
  const [interim, setInterim] = useState("");
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restarts, setRestarts] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRunningRef = useRef(false);
  const optionsRef = useRef<CaptionOptions | null>(null);
  const sessionStartRef = useRef(0);
  const phraseFirstRef = useRef<number | null>(null);
  const lastInterimRef = useRef<number | null>(null);
  const failuresRef = useRef(0);
  const nextIdRef = useRef(1);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStartTimer = () => {
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    startTimerRef.current = null;
  };

  const handleResult = useCallback((event: SpeechRecognitionEventLike) => {
    const options = optionsRef.current;
    if (!options) return;
    const now = performance.now() - sessionStartRef.current;
    const finals: CaptionSegment[] = [];
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const best = result[0];
      if (!best) continue;
      if (!result.isFinal) {
        interimText += best.transcript;
        continue;
      }
      const raw = best.transcript.trim();
      if (!raw) continue;
      const fix = options.fixChessTerms && isEnglishLang(options.lang);
      finals.push({
        confidence: best.confidence > 0 ? best.confidence : null,
        finalAtMs: now,
        finalDelayMs: lastInterimRef.current === null ? null : now - lastInterimRef.current,
        heardAtMs: phraseFirstRef.current ?? now,
        id: nextIdRef.current++,
        raw,
        text: fix ? applyChessTermFixes(raw) : raw
      });
      phraseFirstRef.current = null;
      lastInterimRef.current = null;
    }

    interimText = interimText.trim();
    if (interimText) {
      phraseFirstRef.current ??= now;
      lastInterimRef.current = now;
    }
    failuresRef.current = 0;
    if (finals.length > 0) setSegments((previous) => [...previous, ...finals]);
    setInterim(interimText);
  }, []);

  const launch = useCallback(() => {
    const Recognition = getSpeechRecognition();
    const options = optionsRef.current;
    if (!Recognition || !options) {
      wantRunningRef.current = false;
      setStatus("idle");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = options.lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      clearStartTimer();
      setStatus("listening");
    };
    recognition.onresult = handleResult;
    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (FATAL_SPEECH_ERRORS.has(event.error)) {
        wantRunningRef.current = false;
        setError(SPEECH_ERROR_MESSAGES[event.error]);
        return;
      }
      failuresRef.current += 1;
      if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        wantRunningRef.current = false;
        setError(SPEECH_ERROR_MESSAGES[event.error] ?? `Speech recognition failed (${event.error}).`);
      }
    };
    recognition.onend = () => {
      clearStartTimer();
      recognitionRef.current = null;
      phraseFirstRef.current = null;
      lastInterimRef.current = null;
      setInterim("");
      if (!wantRunningRef.current) {
        setStatus("idle");
        return;
      }
      setRestarts((count) => count + 1);
      restartTimerRef.current = setTimeout(launch, failuresRef.current * 1000);
    };

    recognitionRef.current = recognition;
    clearStartTimer();
    startTimerRef.current = setTimeout(() => {
      if (recognitionRef.current !== recognition) return;
      wantRunningRef.current = false;
      setError("The browser's speech service didn't respond. Use desktop Google Chrome with an internet connection.");
      recognition.abort();
    }, START_TIMEOUT_MS);
    try {
      recognition.start();
    } catch {
      clearStartTimer();
      wantRunningRef.current = false;
      recognitionRef.current = null;
      setError("The browser refused to start speech recognition.");
      setStatus("idle");
    }
  }, [handleResult]);

  const start = useCallback(
    (options: CaptionOptions) => {
      if (wantRunningRef.current) return;
      optionsRef.current = options;
      wantRunningRef.current = true;
      failuresRef.current = 0;
      sessionStartRef.current = performance.now();
      nextIdRef.current = 1;
      setSegments([]);
      setInterim("");
      setError(null);
      setRestarts(0);
      setStatus("starting");
      launch();
    },
    [launch]
  );

  const stop = useCallback(() => {
    wantRunningRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    clearStartTimer();
    const recognition = recognitionRef.current;
    if (!recognition) {
      setStatus("idle");
      return;
    }
    setStatus("stopping");
    recognition.stop();
  }, []);

  const clear = useCallback(() => {
    setSegments([]);
    setInterim("");
    setError(null);
    setRestarts(0);
  }, []);

  useEffect(
    () => () => {
      wantRunningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      clearStartTimer();
      recognitionRef.current?.abort();
    },
    []
  );

  return { clear, error, interim, restarts, segments, start, status, stop };
}
