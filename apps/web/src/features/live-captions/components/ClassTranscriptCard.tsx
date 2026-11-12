"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { TRANSCRIPT_RETENTION_DAYS, type LiveClassTranscriptLine } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfiniteScrollTrigger } from "@/components/ui/InfiniteScrollTrigger";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import { useToast } from "@/providers/ToastProvider";
import { getTranscriptPage } from "../api/transcriptApi";
import { useClassTranscript } from "../hooks/useTranscriptApi";

/** The coach's last lines arrive a moment after the class ends; look again for this long. */
const SETTLE_MS = 30_000;

async function loadAllLines(classId: string): Promise<LiveClassTranscriptLine[]> {
  const lines: LiveClassTranscriptLine[] = [];
  let cursor: string | undefined;
  do {
    const page = await getTranscriptPage(classId, cursor);
    lines.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return lines;
}

/**
 * The stored transcript of the coach's speech, for the coach and admins on the
 * class summary. Renders nothing when the class has no transcript (the setting
 * was off, the coach didn't agree, or the lines have aged out).
 */
export function ClassTranscriptCard({ classId, topic }: { classId: string; topic: string }) {
  const query = useClassTranscript(classId);
  const timeZone = useUserTimeZone();
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const lines = query.data?.pages.flatMap((page) => page.items) ?? [];
  const empty = query.isSuccess && lines.length === 0;
  const { refetch } = query;

  useEffect(() => {
    if (!empty) return;
    const timer = setTimeout(() => void refetch(), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [empty, refetch]);

  if (lines.length === 0) return null;

  const download = async () => {
    setDownloading(true);
    try {
      const all = await loadAllLines(classId);
      const text = all.map((line) => `[${formatTime(line.spokenAt, timeZone)}] ${line.text}`).join("\n");
      const url = URL.createObjectURL(new Blob([`${topic}\n\n${text}\n`], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `class-transcript-${classId}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      toast.error({
        message: cause instanceof Error ? cause.message : undefined,
        title: "Couldn't download the transcript",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle>Class transcript</CardTitle>
          <p className="text-sm text-app-muted">
            The coach&apos;s speech as text, made by the browser&apos;s speech recognition, so expect mistakes. Kept
            for {TRANSCRIPT_RETENTION_DAYS} days. Students can&apos;t see it.
          </p>
        </div>
        <Button type="button" variant="outline" isLoading={downloading} onClick={() => void download()}>
          <Download aria-hidden="true" className="size-4" />
          Download
        </Button>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="custom-scrollbar max-h-96 overflow-y-auto overscroll-contain rounded-app border border-app-border"
          // Scrollable region: reachable by keyboard.
          tabIndex={0}
          role="region"
          aria-label="Class transcript"
        >
          <ol className="divide-y divide-app-border">
            {lines.map((line) => (
              <li key={line.id} className="flex gap-3 px-3 py-2 text-sm">
                <time dateTime={line.spokenAt} className="shrink-0 whitespace-nowrap tabular-nums text-app-muted">
                  {formatTime(line.spokenAt, timeZone)}
                </time>
                <span className="min-w-0 break-words text-app-text" lang={line.lang}>
                  {line.text}
                </span>
              </li>
            ))}
          </ol>
          <InfiniteScrollTrigger className="p-2" query={query} root={scrollRef} size="sm" />
        </div>
      </CardContent>
    </Card>
  );
}
