"use client";

import { useContext, useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MonitorUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Alert } from "@/components/ui/Alert";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { BoardContext } from "@/features/chessboard/context/BoardProvider";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDate } from "@/lib/datetime";
import { Chess } from "@/lib/chess";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { OPENINGS, openingForDay } from "../../../../lib/interactives/openings";
import { SectionTitle, useSharedToolView, type ToolContext } from "../shared";

type Step = { fen: string; san: string; from: string; to: string };
type View = { openingId: string; ply: number };

/** The coach's presented opening + move, or null when it isn't a known one. */
function parseView(raw: unknown): View | null {
  if (!raw || typeof raw !== "object") return null;
  const { openingId, ply } = raw as Record<string, unknown>;
  if (
    typeof openingId !== "string" ||
    !OPENINGS.some((o) => o.id === openingId)
  )
    return null;
  if (typeof ply !== "number" || !Number.isInteger(ply) || ply < 0) return null;
  return { openingId, ply };
}

export function OpeningOfTheDayTool({ isManager }: ToolContext) {
  const timeZone = useUserTimeZone();
  const board = useContext(BoardContext);
  const toast = useToast();
  const today = useMemo(
    () =>
      formatDate(new Date().toISOString(), timeZone, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [timeZone],
  );
  const daily = useMemo(() => openingForDay(today), [today]);
  const [openingId, setOpeningId] = useState(daily.id);
  const [ply, setPly] = useState(0);
  const local = useMemo(() => ({ openingId, ply }), [openingId, ply]);
  // A watching student follows the coach's opening and move, without the controls.
  const { shown, watching } = useSharedToolView<View>(local, parseView);
  const opening = OPENINGS.find((o) => o.id === shown.openingId) ?? daily;

  const line = useMemo(() => {
    const chess = new Chess();
    const steps: Step[] = [];
    try {
      for (const san of opening.moves) {
        const m = chess.move(san);
        steps.push({ fen: chess.fen(), from: m.from, san: m.san, to: m.to });
      }
      return { error: false, start: new Chess().fen(), steps };
    } catch {
      return { error: true, start: new Chess().fen(), steps };
    }
  }, [opening]);

  const at = Math.min(shown.ply, line.steps.length);
  const current = at === 0 ? null : line.steps[at - 1];
  const fen = current?.fen ?? line.start;

  const showOnBoard = () => {
    if (!board) return;
    const chess = new Chess();
    for (const s of line.steps) chess.move(s.san);
    const store = board.getState();
    store.setPgn(chess.pgn());
    if (at === 0) store.jumpToStart();
    else store.jumpToPly(at - 1);
    toast.success({ title: `${opening.name} is on the class board` });
  };

  const nav = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    disabled: boolean,
  ) => (
    <SimpleTooltip label={label}>
      <button
        aria-label={label}
        className="flex size-10 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-text transition-colors hover:bg-app-soft disabled:opacity-40"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {icon}
      </button>
    </SimpleTooltip>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-secondary-ink">
            {opening.id === daily.id ? "Today's opening" : "Opening"}
          </p>
          <h3 className="text-lg font-extrabold leading-tight text-app-text">
            {opening.name}
          </h3>
          <p className="text-xs text-app-muted">ECO {opening.eco}</p>
        </div>
        {watching ? null : (
          <Select
            aria-label="Choose another opening"
            className="w-auto max-w-[12rem]"
            onChange={(e) => {
              setOpeningId(e.target.value);
              setPly(0);
            }}
            options={OPENINGS.map((o) => ({
              label: o.id === daily.id ? `${o.name} (today)` : o.name,
              value: o.id,
            }))}
            value={opening.id}
          />
        )}
      </div>

      {line.error ? (
        <Alert variant="error">
          This opening&apos;s move list couldn&apos;t be played out.
        </Alert>
      ) : null}

      <div className="mx-auto w-full max-w-[22rem]">
        <PracticeBoard
          fen={fen}
          interactive={false}
          lastMove={current ? [current.from, current.to] : null}
        />
      </div>

      {watching ? null : (
        <div className="flex items-center justify-center gap-2">
          {nav(
            "Reset to start",
            <ChevronsLeft className="size-5" strokeWidth={2.5} />,
            () => setPly(0),
            at === 0,
          )}
          {nav(
            "Back one move",
            <ChevronLeft className="size-5" strokeWidth={2.5} />,
            () => setPly(at - 1),
            at === 0,
          )}
          {nav(
            "Next move",
            <ChevronRight className="size-5" strokeWidth={2.5} />,
            () => setPly(at + 1),
            at >= line.steps.length,
          )}
          {nav(
            "Go to the end",
            <ChevronsRight className="size-5" strokeWidth={2.5} />,
            () => setPly(line.steps.length),
            at >= line.steps.length,
          )}
        </div>
      )}

      <ol aria-label="Moves" className="flex flex-wrap gap-1 text-sm">
        {line.steps.map((s, i) => (
          <li key={i}>
            <button
              aria-current={i === at - 1 ? "step" : undefined}
              className={cn(
                "rounded-control px-1.5 py-0.5 transition-colors enabled:hover:bg-app-soft",
                i === at - 1
                  ? "bg-primary font-bold text-white hover:bg-primary"
                  : "text-app-text",
              )}
              disabled={watching}
              onClick={() => setPly(i + 1)}
              type="button"
            >
              {i % 2 === 0 ? `${i / 2 + 1}. ` : ""}
              {s.san}
            </button>
          </li>
        ))}
      </ol>

      <div className="space-y-1.5">
        <SectionTitle>Key ideas</SectionTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-app-text">
          {opening.ideas.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ul>
      </div>

      {isManager && board ? (
        <div className="flex justify-end">
          <Button onClick={showOnBoard} variant="outline">
            <MonitorUp
              aria-hidden="true"
              className="size-4"
              strokeWidth={2.5}
            />
            Put on the class board
          </Button>
        </div>
      ) : null}
    </div>
  );
}
