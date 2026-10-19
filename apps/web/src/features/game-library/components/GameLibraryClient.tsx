"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CHESS_GAME_RESULT_LABELS,
  CHESS_GAME_SOURCE_LABELS,
  type ChessGameResult,
  type ChessGameSource,
  type ChessGameStatus,
  type GameLibraryItem,
} from "@nexa-chess/types";
import { ChevronLeft, ChevronRight, Download, Eye, GitBranch, Library, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useCoachBatches } from "@/features/coach/hooks/useCoachApi";
import { useAuthStore } from "@/stores/authStore";
import { getGame } from "../api/gameLibraryApi";
import { useGameFilterOptions, useGameLibrary } from "../hooks/useGameLibrary";
import { downloadPgn } from "../lib/downloadPgn";
import { ImportGameDialog } from "./ImportGameDialog";

const PAGE_SIZE = 20;

type Filters = {
  q: string;
  studentId: string;
  batchId: string;
  source: "" | ChessGameSource;
  status: "" | ChessGameStatus;
  result: "" | ChessGameResult;
  from?: Date;
  to?: Date;
};

const EMPTY: Filters = { batchId: "", q: "", result: "", source: "", status: "", studentId: "" };

/** A picked calendar day as "YYYY-MM-DD" (the picker hands back local midnight). */
function ymd(date: Date | undefined) {
  if (!date) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function GameLibraryClient() {
  const role = useAuthStore((s) => s.user?.role);
  const isStudent = role === "STUDENT";
  const timeZone = useUserTimeZone();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);

  const query = useMemo(
    () => ({
      batchId: filters.batchId || undefined,
      from: ymd(filters.from),
      page,
      pageSize: PAGE_SIZE,
      q: filters.q || undefined,
      result: filters.result || undefined,
      source: filters.source || undefined,
      status: filters.status || undefined,
      studentId: filters.studentId || undefined,
      to: ymd(filters.to),
    }),
    [filters, page],
  );
  const { data, isLoading, isError, isFetching, refetch } = useGameLibrary(query);
  const { data: options } = useGameFilterOptions();
  // A coach imports into a batch they coach (even one with no games yet).
  const { data: coachBatches } = useCoachBatches({ enabled: role === "COACH" });
  const importBatches =
    role === "COACH" ? (coachBatches?.batches ?? []).map((b) => ({ id: b.id, name: b.name })) : options?.batches ?? [];

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const active = JSON.stringify({ ...filters, q: "" }) !== JSON.stringify({ ...EMPTY, q: "" }) || !!filters.q;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Game library"
        description={
          isStudent
            ? "Games you played in class, the class-board games of classes you attended, and games you uploaded."
            : "Every game played in your classes — class board, simuls and student matches — plus games you imported and your students uploaded."
        }
        actions={
          isStudent ? (
            <Button asChild variant="outline">
              <Link href="/student/insights">
                <Upload className="mr-2 size-4" aria-hidden />
                Upload games
              </Link>
            </Button>
          ) : (
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 size-4" aria-hidden />
              Import PGN
            </Button>
          )
        }
      />

      <Card className="space-y-3 p-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() });
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" aria-hidden />
            <Input
              aria-label="Search games"
              className="pl-9"
              placeholder="Search by title or player name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {!isStudent && (
            <Select
              aria-label="Student"
              value={filters.studentId}
              onChange={(e) => update({ studentId: e.target.value })}
              placeholder="All students"
              options={[{ label: "All students", value: "" }, ...(options?.students ?? []).map((s) => ({ label: s.name, value: s.id }))]}
            />
          )}
          <Select
            aria-label="Batch"
            value={filters.batchId}
            onChange={(e) => update({ batchId: e.target.value })}
            options={[{ label: "All batches", value: "" }, ...(options?.batches ?? []).map((b) => ({ label: b.name, value: b.id }))]}
          />
          <Select
            aria-label="Game type"
            value={filters.source}
            onChange={(e) => update({ source: e.target.value as Filters["source"] })}
            options={[
              { label: "All game types", value: "" },
              ...(Object.entries(CHESS_GAME_SOURCE_LABELS) as [ChessGameSource, string][]).map(([value, label]) => ({ label, value })),
            ]}
          />
          <Select
            aria-label="Result"
            value={filters.result}
            onChange={(e) => update({ result: e.target.value as Filters["result"] })}
            options={[
              { label: "Any result", value: "" },
              ...(Object.entries(CHESS_GAME_RESULT_LABELS) as [ChessGameResult, string][]).map(([value, label]) => ({ label, value })),
            ]}
          />
          <Select
            aria-label="Status"
            value={filters.status}
            onChange={(e) => update({ status: e.target.value as Filters["status"] })}
            options={[
              { label: "Any status", value: "" },
              { label: "In progress", value: "IN_PROGRESS" },
              { label: "Completed", value: "COMPLETED" },
            ]}
          />
          <DatePicker aria-label="From date" placeholder="From date" value={filters.from} onChange={(d) => update({ from: d })} />
          <DatePicker aria-label="To date" placeholder="To date" value={filters.to} onChange={(d) => update({ to: d })} />
          {active && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                update(EMPTY);
              }}
            >
              <X className="mr-1.5 size-4" aria-hidden />
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {isError ? (
        <WidgetError message="The Game Library could not be loaded." onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-control" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <Card className="p-6 sm:p-10">
          <EmptyState variant="inline"
            icon={Library}
            title={active ? "No games match these filters" : "No games yet"}
            description={
              active
                ? "Try clearing a filter or widening the date range."
                : "Games played in live classes are saved here automatically."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className={isFetching ? "divide-y divide-app-border/60 opacity-70" : "divide-y divide-app-border/60"}>
            {data.items.map((game) => (
              <GameRow key={game.id} game={game} timeZone={timeZone} />
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-app-border px-4 py-3 text-sm text-app-muted">
            <span>
              {total} game{total === 1 ? "" : "s"} · page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {importOpen && <ImportGameDialog open={importOpen} onOpenChange={setImportOpen} batches={importBatches} />}
    </div>
  );
}

function ResultBadge({ result }: { result: ChessGameResult }) {
  const variant = result === "*" ? "outline" : result === "1/2-1/2" ? "secondary" : "default";
  return (
    <Badge variant={variant} className="font-mono">
      {result === "*" ? "—" : result}
      <span className="sr-only"> ({CHESS_GAME_RESULT_LABELS[result]})</span>
    </Badge>
  );
}

function GameRow({ game, timeZone }: { game: GameLibraryItem; timeZone: string }) {
  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const detail = await getGame(game.id);
      downloadPgn(detail.pgn, detail.title);
    } catch {
      toast.error("The PGN could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-app-soft/50 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <Link href={`/games/${game.id}`} className="block truncate font-semibold text-app-text hover:text-primary-ink">
          {game.title}
        </Link>
        <p className="truncate text-sm text-app-muted">
          <span className="font-medium text-app-text">{game.whiteName}</span> vs{" "}
          <span className="font-medium text-app-text">{game.blackName}</span>
          {game.classTitle ? ` · ${game.classTitle}` : ""}
          {game.batchName ? ` · ${game.batchName}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
          <ResultBadge result={game.result} />
          <Badge variant="secondary">{CHESS_GAME_SOURCE_LABELS[game.source]}</Badge>
          {game.status === "IN_PROGRESS" && <Badge variant="warning">In progress</Badge>}
          {game.hasVariations && (
            <Badge variant="info">
              <GitBranch className="mr-1 size-3" aria-hidden />
              Variations
            </Badge>
          )}
          <span>{game.moveCount} half-moves</span>
          <span aria-hidden>·</span>
          <time dateTime={game.startedAt}>{formatDateTime(game.startedAt, timeZone)}</time>
          {game.termination && (
            <>
              <span aria-hidden>·</span>
              <span>{game.termination}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SimpleTooltip label="Download PGN">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-primary text-white hover:bg-primary/85"
            aria-label={`Download PGN of ${game.title}`}
            disabled={downloading}
            onClick={() => void handleDownload()}
          >
            <Download className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
        <Button asChild size="sm">
          <Link href={`/games/${game.id}`}>
            <Eye className="mr-1.5 size-4" aria-hidden />
            Open
          </Link>
        </Button>
      </div>
    </li>
  );
}
