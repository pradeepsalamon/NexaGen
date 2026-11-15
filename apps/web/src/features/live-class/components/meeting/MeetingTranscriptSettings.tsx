"use client";

import { TRANSCRIPT_LANGUAGES, transcriptLanguageSchema } from "@nexa-chess/types";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { useSetTranscriptConsent, useTranscriptConsent } from "@/features/live-captions/hooks/useTranscriptApi";
import { useTranscriptStore, type TranscriptRunState } from "@/features/live-captions/lib/transcriptStore";

const STATE_TEXT: Record<TranscriptRunState, string> = {
  error: "Stopped",
  listening: "Listening: your speech is being saved as text",
  "mic-off": "Waiting: your microphone is muted",
  "needs-consent": "Off: it needs your agreement",
  off: "Off",
  paused: "Paused by you",
  starting: "Starting…",
  unsupported: "Not available in this browser. Use desktop Google Chrome.",
};

const LANGUAGE_OPTIONS = TRANSCRIPT_LANGUAGES.map(({ code, label }) => ({ label, value: code }));

/** Settings → "Class transcript": the coach's own controls over being transcribed. */
export function MeetingTranscriptSettings() {
  const { error, lang, paused, retry, runState, savedLines, setConsentDialogOpen, setLang, setPaused } =
    useTranscriptStore(
      useShallow((state) => ({
        error: state.error,
        lang: state.lang,
        paused: state.paused,
        retry: state.retry,
        runState: state.runState,
        savedLines: state.savedLines,
        setConsentDialogOpen: state.setConsentDialogOpen,
        setLang: state.setLang,
        setPaused: state.setPaused,
      })),
    );
  const consent = useTranscriptConsent();
  const setConsent = useSetTranscriptConsent();
  const timeZone = useUserTimeZone();
  const toast = useToast();
  const consented = consent.data?.consented === true;
  const unsupported = runState === "unsupported";

  const withdraw = async () => {
    try {
      await setConsent.mutateAsync(false);
      toast.success({ message: "Nothing more will be transcribed.", title: "Consent withdrawn" });
    } catch (cause) {
      toast.error({
        message: cause instanceof Error ? cause.message : undefined,
        title: "Couldn't withdraw your consent",
      });
    }
  };

  return (
    <div className="space-y-3.5">
      <p className="flex items-start gap-2 text-sm text-app-text" role="status">
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            runState === "listening" ? "bg-success" : runState === "error" ? "bg-danger" : "bg-app-line-strong",
          )}
        />
        <span className="min-w-0">
          {STATE_TEXT[runState]}
          {savedLines > 0 ? <span className="text-app-muted"> · {savedLines} lines saved</span> : null}
        </span>
      </p>

      {runState === "error" ? (
        <div className="space-y-2">
          {error ? <p className="text-xs leading-snug text-danger-ink">{error}</p> : null}
          <Button type="button" size="sm" variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}

      {consented ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="transcript-on">Transcribe my speech</Label>
            <Switch
              checked={!paused}
              disabled={unsupported}
              id="transcript-on"
              onCheckedChange={(on) => setPaused(!on)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transcript-lang">Language I teach in</Label>
            <Select
              density="compact"
              disabled={unsupported}
              id="transcript-lang"
              options={LANGUAGE_OPTIONS}
              value={lang}
              onChange={(event) => {
                const next = transcriptLanguageSchema.safeParse(event.target.value);
                if (next.success) setLang(next.data);
              }}
            />
            <p className="text-xs leading-snug text-app-muted">
              The browser listens for one language at a time; words in another language may come out wrong.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app-border pt-3">
            <p className="text-xs text-app-muted">
              You agreed on {formatFullDate(consent.data?.consentedAt, timeZone)}.
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              isLoading={setConsent.isPending}
              onClick={() => void withdraw()}
            >
              Withdraw consent
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-snug text-app-muted">
            This class is set to keep the coach&apos;s speech as text. Nothing is transcribed until you agree.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={unsupported || !consent.data}
            onClick={() => setConsentDialogOpen(true)}
          >
            Review and agree
          </Button>
        </div>
      )}
    </div>
  );
}
