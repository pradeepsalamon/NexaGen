"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { MAX_TRANSCRIPT_LINE_LENGTH, MAX_TRANSCRIPT_LINES_PER_REQUEST, type TranscriptLineInput } from "@nexa-chess/types";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { appendTranscript, appendTranscriptOnUnload } from "@/features/live-captions/api/transcriptApi";
import { TranscriptConsentDialog } from "@/features/live-captions/components/TranscriptConsentDialog";
import { useSpeechCaptions, type CaptionSegment } from "@/features/live-captions/hooks/useSpeechCaptions";
import { useTranscriptConsent } from "@/features/live-captions/hooks/useTranscriptApi";
import { getSpeechRecognition } from "@/features/live-captions/lib/speechRecognition";
import { useTranscriptStore } from "@/features/live-captions/lib/transcriptStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";

const FLUSH_INTERVAL_MS = 5000;
const FLUSH_AT_LINES = 20;
/** Lines kept while the API is unreachable; beyond it the oldest are dropped. */
const MAX_QUEUED_LINES = 500;

const askedKey = (classId: string) => `nexa-live-class-transcript-asked:${classId}`;

function newClientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Keeps the coach's speech as text while the class setting is on. Only the
 * class's own coach runs it (the API refuses anyone else), in their own
 * browser, on their own microphone: nothing here ever touches a student's
 * audio. Must render inside both `<LiveKitRoom>` and `<LiveClassProvider>`.
 */
export function TranscriptBridge({ classId }: { classId: string }) {
  const role = useAuthStore((state) => state.user?.role);
  const { settings } = useLiveClassState("settings");
  if (role !== "COACH" || settings?.transcript !== "ENABLED") return null;
  return <TranscriptRunner classId={classId} />;
}

function TranscriptRunner({ classId }: { classId: string }) {
  const supported = useMemo(() => getSpeechRecognition() !== null, []);
  const consent = useTranscriptConsent();
  const consented = consent.data?.consented === true;
  // The recogniser listens to the microphone on its own, so it has to follow
  // the room's mute button itself: a muted coach is never transcribed.
  const { isMicrophoneEnabled } = useLocalParticipant();
  const { clear, error, start, status, stop } = useSpeechCaptions();
  const { addSavedLines, consentDialogOpen, lang, paused, retryToken, setConsentDialogOpen, setRun } =
    useTranscriptStore(
      useShallow((state) => ({
        addSavedLines: state.addSavedLines,
        consentDialogOpen: state.consentDialogOpen,
        lang: state.lang,
        paused: state.paused,
        retryToken: state.retryToken,
        setConsentDialogOpen: state.setConsentDialogOpen,
        setRun: state.setRun,
      })),
    );
  /** The API said no (setting turned off, consent withdrawn elsewhere): stop until "Try again". */
  const [refused, setRefused] = useState<string | null>(null);

  const queueRef = useRef<TranscriptLineInput[]>([]);
  const flushingRef = useRef(false);
  const runningLangRef = useRef(lang);

  const flush = useCallback(async () => {
    if (flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;
    const batch = queueRef.current.splice(0, MAX_TRANSCRIPT_LINES_PER_REQUEST);
    try {
      await appendTranscript(classId, { lines: batch });
      addSavedLines(batch.length);
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : undefined;
      if (status && status >= 400 && status < 500 && status !== 401 && status !== 429) {
        // Not retryable: these lines are not wanted. Drop them and stop listening.
        queueRef.current = [];
        setRefused(cause instanceof Error ? cause.message : "The transcript was refused.");
      } else {
        // Offline or a server hiccup: keep the lines (each has its own clientId, so a retry is safe).
        queueRef.current.unshift(...batch);
        const overflow = queueRef.current.length - MAX_QUEUED_LINES;
        if (overflow > 0) queueRef.current.splice(0, overflow);
      }
    } finally {
      flushingRef.current = false;
    }
  }, [addSavedLines, classId]);

  const onFinal = useCallback(
    (segments: CaptionSegment[]) => {
      const now = Date.now();
      for (const segment of segments) {
        queueRef.current.push({
          clientId: newClientId(),
          lang: runningLangRef.current,
          spokenAt: new Date(now - Math.max(0, segment.finalAtMs - segment.heardAtMs)).toISOString(),
          text: segment.text.slice(0, MAX_TRANSCRIPT_LINE_LENGTH),
        });
      }
      if (queueRef.current.length >= FLUSH_AT_LINES) void flush();
    },
    [flush],
  );

  useEffect(() => {
    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    const flushOnUnload = () => {
      const batch = queueRef.current.splice(0, MAX_TRANSCRIPT_LINES_PER_REQUEST);
      if (batch.length > 0) appendTranscriptOnUnload(classId, { lines: batch });
    };
    window.addEventListener("pagehide", flushOnUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", flushOnUnload);
      // Leaving the room or the class ending: send what is still buffered.
      flushOnUnload();
    };
  }, [classId, flush]);

  // "Try again" from the settings panel.
  const seenRetryRef = useRef(retryToken);
  useEffect(() => {
    if (seenRetryRef.current === retryToken) return;
    seenRetryRef.current = retryToken;
    setRefused(null);
    clear();
  }, [clear, retryToken]);

  const shouldRun = supported && consented && !paused && isMicrophoneEnabled && !refused;

  useEffect(() => {
    if (shouldRun) {
      if (status === "idle" && !error) {
        runningLangRef.current = lang;
        start({ fixChessTerms: true, lang, onFinal });
      } else if (status === "listening" && runningLangRef.current !== lang) {
        // One language per recognition session: restart in the new one.
        stop();
      }
    } else if (status === "listening" || status === "starting") {
      stop();
    }
  }, [error, lang, onFinal, shouldRun, start, status, stop]);

  useEffect(() => {
    if (!supported) setRun("unsupported");
    else if (!consent.data) setRun("starting");
    else if (!consented) setRun("needs-consent");
    else if (refused || error) setRun("error", refused ?? error);
    else if (paused) setRun("paused");
    else if (!isMicrophoneEnabled) setRun("mic-off");
    else setRun(status === "listening" ? "listening" : "starting");
  }, [consent.data, consented, error, isMicrophoneEnabled, paused, refused, setRun, status, supported]);
  useEffect(() => () => useTranscriptStore.getState().setRun("off"), []);

  // Ask once per class per tab; "Not now" leaves it in Settings → Class transcript.
  useEffect(() => {
    if (!supported) {
      toast.info("This class keeps a transcript, but this browser can't make one. Use desktop Google Chrome.", {
        id: "transcript-unsupported",
      });
      return;
    }
    if (!consent.data || consented) return;
    try {
      if (window.sessionStorage.getItem(askedKey(classId))) return;
      window.sessionStorage.setItem(askedKey(classId), "1");
    } catch {
      // No sessionStorage: ask on every join.
    }
    setConsentDialogOpen(true);
  }, [classId, consent.data, consented, setConsentDialogOpen, supported]);

  const announcedRef = useRef(false);
  useEffect(() => {
    if (status !== "listening" || announcedRef.current) return;
    announcedRef.current = true;
    toast.info("Transcript on: your speech is being saved as text.", { id: "transcript-on" });
  }, [status]);

  return <TranscriptConsentDialog open={consentDialogOpen} onOpenChange={setConsentDialogOpen} />;
}
