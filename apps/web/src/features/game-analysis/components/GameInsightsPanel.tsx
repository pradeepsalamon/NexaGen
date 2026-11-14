"use client";

import { useState } from "react";
import Link from "next/link";
import {
  EXTERNAL_CHESS_PROVIDER_LABELS,
  GAME_ANALYSIS_STATUS_LABELS,
  TACTIC_MOTIF_LABELS,
  type MotifInsight,
  type StudentGameInsights,
} from "@nexa-chess/types";
import { Activity, Crosshair, Gauge, Swords } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useAnalysedGames, useGameInsights } from "../hooks/useGameAnalysis";

const VERDICT: Record<MotifInsight["verdict"], { label: string; variant: "warning" | "success" | "outline" | "secondary" }> = {
  NEUTRAL: { label: "No clear pattern", variant: "secondary" },
  NOT_ENOUGH_DATA: { label: "Not enough games yet", variant: "outline" },
  STRENGTH: { label: "Strength", variant: "success" },
  WEAKNESS: { label: "Recurring weakness", variant: "warning" },
};

const sourceLabel = (source: string) =>
  source in EXTERNAL_CHESS_PROVIDER_LABELS
    ? EXTERNAL_CHESS_PROVIDER_LABELS[source as keyof typeof EXTERNAL_CHESS_PROVIDER_LABELS]
    : source === "IMPORT"
      ? "Uploaded PGN"
      : "NexaGen class games";

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Evidence across a student's analysed games. `studentId` null = the signed-in
 * student. Every figure says how many games it rests on, and nothing is
 * called a weakness or a trend until the shared minimum-evidence thresholds
 * are met (INSIGHT_THRESHOLDS).
 */
export function GameInsightsPanel({ studentId }: { studentId: string | null }) {
  const insights = useGameInsights(studentId);

  if (insights.isLoading) {
    return (
      <div aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton className="h-32 w-full rounded-app" key={i} />
        ))}
      </div>
    );
  }
  if (insights.isError || !insights.data) {
    return <WidgetError message={insights.error?.message} onRetry={() => void insights.refetch()} />;
  }
  const data = insights.data;
  if (data.gamesAnalysed === 0) {
    return (
      <EmptyState
        description={
          studentId
            ? "No analysed games yet. Games appear here once they have been analysed from the Game Library."
            : "Analyse a few of your games from the Game Library — upload a PGN or open a class game and press “Analyse game”."
        }
        title="No analysed games yet"
      />
    );
  }
  return <InsightsBody data={data} studentId={studentId} />;
}

function InsightsBody({ data, studentId }: { data: StudentGameInsights; studentId: string | null }) {
  const t = data.thresholds;
  const few = data.gamesAnalysed < t.minGamesForRates;
  const trend = data.trend;
  return (
    <div className="space-y-5">
      {few && (
        <Alert variant="info">
          Based on {data.gamesAnalysed} analysed game{data.gamesAnalysed === 1 ? "" : "s"}. Rates and patterns appear from{" "}
          {t.minGamesForRates} games; a weakness needs at least {t.minMissesForWeakness} misses across {t.minGamesForWeakness} games.
        </Alert>
      )}
      {data.excludedOtherVersions > 0 && (
        <p className="text-xs text-app-muted">
          {data.excludedOtherVersions} older analyses use an earlier version of the method and are left out, so the numbers stay comparable.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Activity} label="Games analysed" tone="primary" value={String(data.gamesAnalysed)} />
        <StatTile
          context={plural(data.byColor.white.games, "game")}
          icon={Gauge}
          label="Accuracy as White"
          tone="accent"
          value={pct(data.byColor.white.accuracy)}
        />
        <StatTile
          context={plural(data.byColor.black.games, "game")}
          icon={Gauge}
          label="Accuracy as Black"
          tone="secondary"
          value={pct(data.byColor.black.accuracy)}
        />
        <StatTile
          context={`per 100 judged moves (${data.errorRates.judgedMoves})`}
          icon={Swords}
          label="Blunders"
          tone="warm"
          value={data.errorRates.blunders === null ? "—" : String(data.errorRates.blunders)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Accuracy trend</h3>
          {trend.verdict === "NOT_ENOUGH_DATA" ? (
            <p className="text-sm text-app-muted">
              Needs {t.minGamesPerTrendWindow} recent and {t.minGamesPerTrendWindow} earlier analysed games to compare (now {trend.recent.games + trend.previous.games}).
            </p>
          ) : (
            <p className="text-sm">
              Last {trend.recent.games} games: <strong>{pct(trend.recent.accuracy)}</strong> · the {trend.previous.games} before:{" "}
              <strong>{pct(trend.previous.accuracy)}</strong> —{" "}
              {trend.verdict === "IMPROVING" ? "improving" : trend.verdict === "DECLINING" ? "lower than before" : "steady"}.
            </p>
          )}
        </Card>
        <Card className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">By phase</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {(["OPENING", "MIDDLEGAME", "ENDGAME"] as const).map((phase) => (
              <div className="contents" key={phase}>
                <dt className="text-app-muted">{phase[0] + phase.slice(1).toLowerCase()}</dt>
                <dd>
                  {plural(data.phases[phase].moves, "move")} ·{" "}
                  {data.phases[phase].errorRate === null ? "error rate after more games" : `${data.phases[phase].errorRate} mistakes+blunders per 100`}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Crosshair className="size-4 text-accent-ink" aria-hidden strokeWidth={2.25} />
          Tactics
        </h3>
        {data.motifs.length === 0 ? (
          <p className="text-sm text-app-muted">No tactics have come up in the analysed games yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pattern</TableHead>
                  <TableHead className="text-right">Chances</TableHead>
                  <TableHead className="text-right">Found</TableHead>
                  <TableHead className="text-right">Missed</TableHead>
                  <TableHead className="text-right">Handed over</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Examples</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.motifs.map((m) => (
                  <TableRow key={m.motif}>
                    <TableCell className="font-medium">{TACTIC_MOTIF_LABELS[m.motif]}</TableCell>
                    <TableCell className="text-right">{m.opportunities}</TableCell>
                    <TableCell className="text-right">{m.found}</TableCell>
                    <TableCell className="text-right">
                      {m.missed}
                      {m.missRate !== null && <span className="ml-1 text-xs text-app-muted">({Math.round(m.missRate * 100)}%)</span>}
                    </TableCell>
                    <TableCell className="text-right">{m.allowed}</TableCell>
                    <TableCell>
                      <Badge variant={VERDICT[m.verdict].variant}>{VERDICT[m.verdict].label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.evidence.examples.slice(0, 3).map((e, i) => (
                          <Link
                            className="rounded-control px-1.5 text-xs font-semibold text-primary-ink underline-offset-2 hover:underline"
                            href={`/games/${e.gameId}?ply=${e.ply}`}
                            key={`${e.analysisId}-${e.ply}`}
                          >
                            #{i + 1}
                          </Link>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-app-muted">
          “Chances” counts positions where a tactic was really there (the engine’s line wins material or mates). “Handed over” counts your
          moves that gave the opponent one.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Time pressure</h3>
          {data.time ? (
            <p className="text-sm">
              Low on time in {data.time.lowTimeMoves} of {data.time.clockedMoves} clocked moves.{" "}
              {data.time.lowTimeErrorRate !== null && data.time.otherErrorRate !== null
                ? `Error rate when low on time: ${data.time.lowTimeErrorRate}%, otherwise ${data.time.otherErrorRate}%.`
                : "More games with clocks are needed before comparing error rates."}
            </p>
          ) : (
            <p className="text-sm text-app-muted">
              Not available: these games don’t carry move-by-move clock times. Games imported from Lichess or Chess.com usually do.
            </p>
          )}
        </Card>
        <Card className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Ratings by source</h3>
          {data.ratings.length === 0 ? (
            <p className="text-sm text-app-muted">No ratings in the game records.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.ratings.map((r) => (
                <li key={r.source}>
                  {sourceLabel(r.source)}: <strong>{r.latest}</strong>{" "}
                  <span className="text-app-muted">(latest of {r.games} games)</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-app-muted">Each site has its own rating pool, so they are never combined.</p>
        </Card>
      </div>

      {data.openings.length > 0 && (
        <Card className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Openings (as named in the game records)</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Opening</TableHead>
                  <TableHead>Colour</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">W / D / L</TableHead>
                  <TableHead className="text-right">Accuracy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.openings.map((o) => (
                  <TableRow key={`${o.color}-${o.eco}-${o.name}`}>
                    <TableCell>
                      {o.name ?? "—"} {o.eco && <span className="text-xs text-app-muted">({o.eco})</span>}
                    </TableCell>
                    <TableCell>{o.color === "white" ? "White" : "Black"}</TableCell>
                    <TableCell className="text-right">{o.games}</TableCell>
                    <TableCell className="text-right">
                      {o.wins} / {o.draws} / {o.losses}
                    </TableCell>
                    <TableCell className="text-right">{pct(o.accuracy)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-app-muted">One or two games say little about an opening — read these as a list, not a verdict.</p>
        </Card>
      )}

      <AnalysedGamesTable studentId={studentId} />
    </div>
  );
}

function AnalysedGamesTable({ studentId }: { studentId: string | null }) {
  const tz = useUserTimeZone();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState("");
  const [side, setSide] = useState("");
  const games = useAnalysedGames(studentId, { page, pageSize: 10, result, side });
  const data = games.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">Analysed games</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Select
            aria-label="Result"
            className="sm:w-40"
            onChange={(e) => {
              setResult(e.target.value);
              setPage(1);
            }}
            options={[
              { label: "Any result", value: "" },
              { label: "Wins", value: "WIN" },
              { label: "Draws", value: "DRAW" },
              { label: "Losses", value: "LOSS" },
            ]}
            value={result}
          />
          <Select
            aria-label="Colour"
            className="sm:w-40"
            onChange={(e) => {
              setSide(e.target.value);
              setPage(1);
            }}
            options={[
              { label: "Either colour", value: "" },
              { label: "As White", value: "white" },
              { label: "As Black", value: "black" },
            ]}
            value={side}
          />
        </div>
      </div>
      {games.isError ? (
        <WidgetError message={games.error?.message} onRetry={() => void games.refetch()} />
      ) : !data ? (
        <Skeleton className="h-40 w-full rounded-app" />
      ) : data.items.length === 0 ? (
        <p className="text-sm text-app-muted">No analysed games match.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Game</TableHead>
                <TableHead>Played</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">Accuracy</TableHead>
                <TableHead className="text-right">Mistakes</TableHead>
                <TableHead className="text-right">Blunders</TableHead>
                <TableHead className="text-right">Missed tactics</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((g) => (
                <TableRow key={g.analysisId}>
                  <TableCell className="max-w-[16rem]">
                    <Link className="font-medium text-primary-ink underline-offset-2 hover:underline" href={`/games/${g.gameId}`}>
                      vs {g.opponentName}
                    </Link>
                    <p className="truncate text-xs text-app-muted">
                      {g.side === "white" ? "White" : "Black"} · {sourceLabel(g.source)}
                      {g.timeControl ? ` · ${g.timeControl}` : ""}
                      {g.status === "PARTIAL" ? ` · ${GAME_ANALYSIS_STATUS_LABELS.PARTIAL.toLowerCase()}` : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <time dateTime={g.playedAt}>{formatFullDate(g.playedAt, tz)}</time>
                  </TableCell>
                  <TableCell>{g.result === "UNKNOWN" ? "—" : g.result[0] + g.result.slice(1).toLowerCase()}</TableCell>
                  <TableCell className="text-right">{pct(g.accuracy)}</TableCell>
                  <TableCell className="text-right">{g.mistakes}</TableCell>
                  <TableCell className="text-right">{g.blunders}</TableCell>
                  <TableCell className="text-right">{g.missedTactics}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-end gap-2">
          <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} variant="outline">
            Previous
          </Button>
          <span className="text-sm text-app-muted">
            Page {page} of {pages}
          </span>
          <Button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} variant="outline">
            Next
          </Button>
        </div>
      )}
    </Card>
  );
}
