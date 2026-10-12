"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { eloExpectedScore, eloRatingChange } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import {
  newId,
  readLocal,
  SectionTitle,
  useSharedToolView,
  writeLocal,
} from "../shared";

type Game = { id: string; opponent: string; score: "1" | "0.5" | "0" };
type Saved = { rating: string; k: string; games: Game[] };

const STORAGE_KEY = "nexa-interactives-rating";
const K_OPTIONS = [
  {
    label: "K = 40 — new players (under 30 games) and juniors under 2300",
    value: "40",
  },
  { label: "K = 20 — rated under 2400", value: "20" },
  { label: "K = 10 — rated 2400 or more", value: "10" },
];
const DEFAULT: Saved = {
  games: [{ id: "g1", opponent: "1500", score: "1" }],
  k: "20",
  rating: "1400",
};

/** The coach's presented calculator, or null when it isn't a well-formed one. */
function parseSaved(raw: unknown): Saved | null {
  if (!raw || typeof raw !== "object") return null;
  const { games, k, rating } = raw as Record<string, unknown>;
  if (typeof rating !== "string" || typeof k !== "string") return null;
  if (!Array.isArray(games) || games.length === 0 || games.length > 20)
    return null;
  const ok = games.every(
    (g) =>
      g &&
      typeof g === "object" &&
      typeof (g as Game).id === "string" &&
      typeof (g as Game).opponent === "string" &&
      ["1", "0.5", "0"].includes((g as Game).score),
  );
  return ok ? { games: games as Game[], k, rating } : null;
}

const fmt = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export function RatingCalculatorTool() {
  const [mine, setSaved] = useState<Saved>(() =>
    readLocal(STORAGE_KEY, DEFAULT),
  );
  useEffect(() => writeLocal(STORAGE_KEY, mine), [mine]);
  // A watching student sees the coach's figures, read-only.
  const { shown: saved, watching } = useSharedToolView(mine, parseSaved);

  const rating = Number.parseInt(saved.rating, 10);
  const k = Number(saved.k);
  const ratingValid =
    Number.isFinite(rating) && rating >= 100 && rating <= 3500;

  const rows = saved.games.map((g) => {
    const opp = Number.parseInt(g.opponent, 10);
    const valid =
      ratingValid && Number.isFinite(opp) && opp >= 100 && opp <= 3500;
    return {
      ...g,
      change: valid ? eloRatingChange(rating, opp, Number(g.score), k) : null,
      expected: valid ? eloExpectedScore(rating, opp) : null,
    };
  });
  const allValid = rows.length > 0 && rows.every((r) => r.change !== null);
  const total = rows.reduce((sum, r) => sum + (r.change ?? 0), 0);
  const scored = rows.reduce((sum, r) => sum + Number(r.score), 0);
  const expectedTotal = rows.reduce((sum, r) => sum + (r.expected ?? 0), 0);

  const update = (patch: Partial<Saved>) =>
    setSaved((s) => ({ ...s, ...patch }));
  const updateGame = (id: string, patch: Partial<Game>) =>
    update({
      games: saved.games.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rc-rating">Your rating</Label>
          <Input
            hasError={!ratingValid}
            disabled={watching}
            id="rc-rating"
            inputMode="numeric"
            onChange={(e) => update({ rating: e.target.value })}
            type="number"
            value={saved.rating}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-k">K-factor</Label>
          <Select
            disabled={watching}
            id="rc-k"
            onChange={(e) => update({ k: e.target.value })}
            options={K_OPTIONS}
            value={saved.k}
          />
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>Games</SectionTitle>
        {rows.map((g, i) => (
          <div
            className="grid grid-cols-[1fr_auto_auto] items-center gap-2"
            key={g.id}
          >
            <Input
              aria-label={`Game ${i + 1} opponent rating`}
              disabled={watching}
              hasError={g.change === null && ratingValid}
              inputMode="numeric"
              onChange={(e) => updateGame(g.id, { opponent: e.target.value })}
              placeholder="Opponent rating"
              type="number"
              value={g.opponent}
            />
            <Select
              aria-label={`Game ${i + 1} result`}
              className="w-28"
              disabled={watching}
              onChange={(e) =>
                updateGame(g.id, { score: e.target.value as Game["score"] })
              }
              options={[
                { label: "Win", value: "1" },
                { label: "Draw", value: "0.5" },
                { label: "Loss", value: "0" },
              ]}
              value={g.score}
            />
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "w-12 text-right text-sm font-bold tabular-nums",
                  g.change === null
                    ? "text-app-muted"
                    : g.change >= 0
                      ? "text-accent-ink"
                      : "text-app-danger-ink",
                )}
              >
                {g.change === null ? "—" : fmt(g.change)}
              </span>
              {watching ? null : (
                <SimpleTooltip label="Remove game">
                  <button
                    aria-label={`Remove game ${i + 1}`}
                    className="flex size-8 items-center justify-center rounded-full bg-app-danger text-white transition-colors hover:bg-app-danger/85 disabled:opacity-40"
                    disabled={saved.games.length === 1}
                    onClick={() =>
                      update({
                        games: saved.games.filter((x) => x.id !== g.id),
                      })
                    }
                    type="button"
                  >
                    <Trash2
                      aria-hidden="true"
                      className="size-3.5"
                      strokeWidth={2.5}
                    />
                  </button>
                </SimpleTooltip>
              )}
            </div>
          </div>
        ))}
        {watching ? null : (
          <div className="flex justify-end">
            <Button
              disabled={saved.games.length >= 20}
              onClick={() =>
                update({
                  games: [
                    ...saved.games,
                    { id: newId(), opponent: "", score: "1" },
                  ],
                })
              }
              size="sm"
              variant="outline"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Add game
            </Button>
          </div>
        )}
      </div>

      <div
        aria-live="polite"
        className="rounded-app border border-app-border bg-app-soft p-4"
      >
        {allValid ? (
          <div className="grid grid-cols-3 items-center text-center">
            <p>
              <span className="block text-xs font-bold uppercase text-app-muted">
                Before
              </span>
              <span className="text-2xl font-extrabold text-app-text">
                {rating}
              </span>
            </p>
            <p
              className={cn(
                "text-lg font-extrabold",
                total >= 0 ? "text-accent-ink" : "text-app-danger-ink",
              )}
            >
              {fmt(total)}
            </p>
            <p>
              <span className="block text-xs font-bold uppercase text-app-muted">
                After
              </span>
              <span className="text-2xl font-extrabold text-primary-ink">
                {Math.round(rating + total)}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-center text-sm text-app-muted">
            Enter ratings between 100 and 3500 to see the result.
          </p>
        )}
        {allValid ? (
          <p className="mt-2 text-center text-xs text-app-muted">
            Scored {scored} of {rows.length}; expected{" "}
            {expectedTotal.toFixed(2)}.
          </p>
        ) : null}
      </div>

      <details className="text-xs text-app-muted">
        <summary className="cursor-pointer font-bold">
          How it&apos;s calculated
        </summary>
        <p className="mt-1">
          Elo, the way FIDE rates standard games: expected score E = 1 / (1 +
          10^((opponent − you) / 400)), with the gap capped at 400. Each game
          changes the rating by K × (result − E); a period&apos;s games all use
          the rating you started with, and the total is rounded at the end.
          Online sites (Glicko) and national federations can differ.
        </p>
      </details>
    </div>
  );
}
