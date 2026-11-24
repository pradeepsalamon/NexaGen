"use client";

import {
  PLAY_FINDING_LABELS,
  PLAY_SOURCE_LABELS,
  type PlayFinding,
  type PlayItemSummary,
  type PlaySegment
} from "@nexa-chess/types";
import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { PgnBoardViewer } from "@/features/assignments/components/PgnBoardViewer";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { usePlayItem } from "../hooks/usePlayReviewApi";
import { ReviewBadge } from "./BoardPlayPanel";

const STANDARD_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** The segment as a PGN the board viewer can step through. */
function segmentPgn(segment: PlaySegment): string {
  const blackFirst = segment.startFen.split(" ")[1] === "b";
  const fullMove = Number(segment.startFen.split(" ")[5]) || 1;
  const tokens: string[] = [];
  segment.moves.forEach((move, i) => {
    const ply = i + (blackFirst ? 1 : 0);
    const number = fullMove + Math.floor(ply / 2);
    if (ply % 2 === 0) tokens.push(`${number}.`);
    else if (i === 0) tokens.push(`${number}...`);
    tokens.push(move.san ?? move.uci);
  });
  const header = segment.startFen === STANDARD_START ? "" : `[SetUp "1"]\n[FEN "${segment.startFen}"]\n\n`;
  return `${header}${tokens.join(" ")} *`;
}

function moveLabel(segment: PlaySegment, ply: number): string {
  const blackFirst = segment.startFen.split(" ")[1] === "b";
  const fullMove = Number(segment.startFen.split(" ")[5]) || 1;
  const index = ply - 1 + (blackFirst ? 1 : 0);
  return `${fullMove + Math.floor(index / 2)}${index % 2 === 0 ? "." : "…"}`;
}

function FindingRow({ finding, segment }: { finding: PlayFinding; segment: PlaySegment | undefined }) {
  const label = finding.kind === "MISSED_TACTIC" && finding.motif ? `Missed ${finding.motif.toLowerCase().replace(/_/g, " ")}` : PLAY_FINDING_LABELS[finding.kind];
  return (
    <li className="rounded-app border border-app-border px-3 py-2 text-sm">
      <span className="font-semibold text-app-text">{label}</span>
      <span className="text-app-muted">
        {" "}
        on {segment ? moveLabel(segment, finding.ply) : ""} {finding.playedSan}
        {finding.bestMoveSan ? ` (better: ${finding.bestMoveSan})` : ""}
      </span>
    </li>
  );
}

/** One play item: the board, the moves (the student's in bold), the engine's findings and any outside-AI comment. */
export function PlayItemDialog({
  item,
  onClose,
  studentId
}: {
  item: PlayItemSummary | null;
  onClose: () => void;
  studentId: string | null;
}) {
  const tz = useUserTimeZone();
  const detail = usePlayItem(studentId, item ? { source: item.source, sourceId: item.sourceId } : null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const segments = detail.data?.item.segments ?? [];
  const segment = segments[Math.min(segmentIndex, Math.max(0, segments.length - 1))];
  const pgn = useMemo(() => (segment ? segmentPgn(segment) : ""), [segment]);
  const findings = (detail.data?.review?.findings ?? []).filter((f) => f.segment === Math.min(segmentIndex, segments.length - 1));

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setSegmentIndex(0);
        }
      }}
      open={!!item}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{item?.title ?? "Board play"}</DialogTitle>
          <DialogDescription>
            {item ? `${PLAY_SOURCE_LABELS[item.source]} · ${formatDateTime(item.playedAt, tz)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <Skeleton className="h-80 w-full rounded-app" />
        ) : detail.isError || !detail.data ? (
          <WidgetError message={detail.error?.message} onRetry={() => void detail.refetch()} />
        ) : (
          <div className="space-y-4">
            <ReviewBadge review={detail.data.item.review} />

            {segments.length > 1 ? (
              <Select
                aria-label="Which puzzle"
                onChange={(e) => setSegmentIndex(Number(e.target.value))}
                options={segments.map((s, i) => ({ label: `${s.label ?? `Part ${i + 1}`}${s.result ? ` · ${s.result}` : ""}`, value: String(i) }))}
                value={String(segmentIndex)}
              />
            ) : null}

            {segment ? (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <PgnBoardViewer key={`${item?.key}:${segmentIndex}`} pgn={pgn} />
                <div className="space-y-3">
                  <p aria-label="Moves" className="text-sm leading-7 text-app-muted">
                    {segment.moves.map((move) => (
                      <span className="mr-1.5 inline-block" key={move.ply}>
                        {move.ply === 1 || (moveLabel(segment, move.ply).endsWith(".") && move.ply > 0) ? (
                          <span className="mr-0.5 text-xs">{moveLabel(segment, move.ply)}</span>
                        ) : null}
                        <span
                          className={cn(
                            move.byStudent && "font-semibold text-app-text",
                            move.byStudent && move.correct === false && "text-app-danger-ink"
                          )}
                        >
                          {move.san ?? move.uci}
                        </span>
                      </span>
                    ))}
                  </p>
                  <p className="text-xs text-app-muted">Bold moves were played by the student.</p>

                  {findings.length > 0 ? (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-app-text">What the engine found</h3>
                      <ul className="space-y-2">
                        {findings.map((f) => (
                          <FindingRow finding={f} key={`${f.kind}:${f.segment}:${f.ply}`} segment={segment} />
                        ))}
                      </ul>
                    </div>
                  ) : detail.data.review?.status === "DONE" ? (
                    <p className="text-sm text-app-muted">The engine found nothing to correct here.</p>
                  ) : null}

                  {detail.data.comment ? (
                    <div className="rounded-app border border-app-border bg-app-soft p-3">
                      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-app-text">
                        <Sparkles aria-hidden className="size-4 text-accent-ink" strokeWidth={2.5} />
                        Coach-style comment
                      </h3>
                      <p className="text-sm text-app-text">{detail.data.comment.text}</p>
                      <p className="mt-1 text-xs text-app-muted">Written by {detail.data.comment.provider} from the engine review.</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
