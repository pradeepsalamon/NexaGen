"use client";

import { Captions, Clock, Copy, Download, Eraser, Mic, MicOff, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Label } from "@/components/ui/Label";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select, type SelectOption } from "@/components/ui/Select";
import { StatTile } from "@/components/ui/StatTile";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/providers/ToastProvider";
import { type CaptionSegment, useSpeechCaptions } from "../hooks/useSpeechCaptions";
import { isEnglishLang } from "../lib/chessTermFixes";
import { getSpeechRecognition } from "../lib/speechRecognition";

// Admin-only evaluation of option A in LIVE_CAPTIONS.md: the browser's own
// speech recognition on the speaker's mic. Nothing is saved or sent to the
// API; the transcript lives in this tab until it is copied or downloaded.

const LANGUAGES: SelectOption[] = [
  { label: "Tamil (India)", value: "ta-IN" },
  { label: "English (India)", value: "en-IN" },
  { label: "English (US)", value: "en-US" }
];

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSeconds(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function countWords(segments: CaptionSegment[]): number {
  return segments.reduce((total, segment) => total + segment.text.split(/\s+/).filter(Boolean).length, 0);
}

function transcriptText(segments: CaptionSegment[], settings: { lang: string; fixChessTerms: boolean }) {
  const header = [
    `Language: ${settings.lang}`,
    `Chess term fixes: ${settings.fixChessTerms && isEnglishLang(settings.lang) ? "on" : "off"}`,
    ""
  ];
  const lines = segments.flatMap((segment) => {
    const line = `[${formatClock(segment.heardAtMs)}] ${segment.text}`;
    return segment.raw === segment.text ? [line] : [line, `        heard: ${segment.raw}`];
  });
  return [...header, ...lines].join("\n");
}

export function CaptionTestClient() {
  const toast = useToast();
  const { clear, error, interim, restarts, segments, start, status, stop } = useSpeechCaptions();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [lang, setLang] = useState("ta-IN");
  const [fixChessTerms, setFixChessTerms] = useState(true);
  const [consent, setConsent] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const running = status !== "idle";
  const english = isEnglishLang(lang);

  // Detected after mount: the server render has no window.
  useEffect(() => setSupported(getSpeechRecognition() !== null), []);

  useEffect(() => {
    const list = transcriptRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [segments.length]);

  const stats = useMemo(() => {
    const confidences = segments.flatMap((segment) => (segment.confidence === null ? [] : [segment.confidence]));
    return {
      confidence: confidences.length
        ? `${Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)}%`
        : "—",
      medianDelay: median(segments.flatMap((segment) => (segment.finalDelayMs === null ? [] : [segment.finalDelayMs]))),
      words: countWords(segments)
    };
  }, [segments]);

  const lastLines = segments.slice(-2);
  const settings = { fixChessTerms, lang };
  // The settings the transcript was captured with: changing the language
  // after Stop must not relabel what was already recorded.
  const [captured, setCaptured] = useState(settings);

  const handleStart = () => {
    setCaptured(settings);
    start(settings);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcriptText(segments, captured));
      toast.success({ title: "Transcript copied" });
    } catch {
      toast.error({ title: "Couldn't copy the transcript" });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([transcriptText(segments, captured)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `caption-test-${captured.lang}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Caption test"
        description="Try the browser's live speech recognition before it goes into live classes. Nothing here is saved."
        actions={
          running ? (
            <Button disabled={status === "stopping"} onClick={stop} variant="destructive">
              <MicOff className="size-4" strokeWidth={2.5} />
              {status === "stopping" ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            <Button disabled={!supported || !consent} onClick={handleStart}>
              <Mic className="size-4" strokeWidth={2.5} />
              Start listening
            </Button>
          )
        }
      />

      {supported === false ? (
        <Alert title="This browser can't do live speech recognition" variant="error">
          Open this page in desktop Google Chrome. Firefox has no speech recognition, and Edge and Safari often
          refuse it.
        </Alert>
      ) : (
        <Alert title="The speaker's voice goes to the browser's speech service" variant="warning">
          Chrome sends the microphone audio to Google to turn it into text. Only test with someone who has agreed to that, and not with students in the room. The
          transcript stays in this tab.
        </Alert>
      )}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <SectionCard description="Locked while listening." title="Settings">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="caption-lang">Spoken language</Label>
              <Select
                disabled={running}
                id="caption-lang"
                onChange={(event) => setLang(event.target.value)}
                options={LANGUAGES}
                value={lang}
              />
            </div>

            <div className="space-y-1">
              <Switch
                checked={fixChessTerms && english}
                disabled={running || !english}
                label="Fix chess terms"
                onCheckedChange={setFixChessTerms}
              />
              <p className="text-xs text-app-muted">
                {english
                  ? "Corrects common mishearings like \"porn\" → pawn and \"night\" → knight. The original is kept."
                  : "English only for now. Tamil needs a glossary reviewed by a coach."}
              </p>
            </div>

            <Checkbox
              checked={consent}
              disabled={running}
              id="caption-consent"
              label="The person speaking agrees to their voice being processed by the browser's speech service."
              onCheckedChange={(value) => setConsent(value === true)}
            />
          </div>
        </SectionCard>

        <SectionCard
          actions={
            running ? (
              <Badge variant="success">
                <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-success motion-safe:animate-pulse" />
                {status === "starting" ? "Starting" : status === "stopping" ? "Stopping" : "Listening"}
              </Badge>
            ) : (
              <Badge variant="outline">Off</Badge>
            )
          }
          description="How students would see it over the coach's video."
          title="Caption preview"
        >
          {/* Stands in for a video tile, so it stays dark in both themes. */}
          <div className="relative flex aspect-video items-end overflow-hidden rounded-control bg-black">
            <Captions aria-hidden="true" className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-white/20" />
            <div aria-live="polite" className="relative w-full p-3 sm:p-4">
              {lastLines.length > 0 || interim ? (
                <div className="mx-auto max-w-3xl space-y-1 rounded-control bg-black/60 px-3 py-2 text-center text-base leading-snug text-white sm:text-lg">
                  {lastLines.map((segment) => (
                    <p key={segment.id}>{segment.text}</p>
                  ))}
                  {interim ? <p className="text-white/60">{interim}</p> : null}
                </div>
              ) : (
                <p className="text-center text-sm text-white/60">
                  {running ? "Speak now…" : "Captions appear here once you start listening."}
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Captions} label="Phrases" tone="primary" value={String(segments.length)} />
        <StatTile context={`Confidence ${stats.confidence}`} icon={Mic} label="Words" tone="accent" value={String(stats.words)} />
        <StatTile icon={Clock} label="Median wait after a pause" tone="secondary" value={formatSeconds(stats.medianDelay)} />
        <StatTile icon={RefreshCw} label="Recognition restarts" tone="warm" value={String(restarts)} />
      </div>

      <SectionCard
        actions={
          <div className="flex flex-wrap gap-2">
            <Button disabled={segments.length === 0} onClick={handleCopy} size="sm" variant="outline">
              <Copy className="size-4" strokeWidth={2.5} />
              Copy
            </Button>
            <Button disabled={segments.length === 0} onClick={handleDownload} size="sm" variant="outline">
              <Download className="size-4" strokeWidth={2.5} />
              Download
            </Button>
            <Button disabled={segments.length === 0 || running} onClick={clear} size="sm" variant="outline">
              <Eraser className="size-4" strokeWidth={2.5} />
              Clear
            </Button>
          </div>
        }
        description="Each finished phrase, with when it was first heard and how long the caption took to settle after the pause."
        title="Transcript"
      >
        {segments.length === 0 ? (
          <EmptyState description="Finished phrases are listed here." title="No transcript yet" variant="inline" />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto" ref={transcriptRef}>
          <ol className="space-y-2">
            {segments.map((segment) => (
              <li className="rounded-control border border-app-border bg-app-soft px-3 py-2" key={segment.id}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs tabular-nums text-app-muted">{formatClock(segment.heardAtMs)}</span>
                  <p className="min-w-0 flex-1 text-sm text-app-text">{segment.text}</p>
                  <span className="text-xs tabular-nums text-app-muted">
                    {segment.confidence === null ? "" : `${Math.round(segment.confidence * 100)}% · `}
                    {formatSeconds(segment.finalDelayMs)}
                  </span>
                </div>
                {segment.raw !== segment.text ? (
                  <p className="mt-1 text-xs text-app-muted">Heard: {segment.raw}</p>
                ) : null}
              </li>
            ))}
          </ol>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
