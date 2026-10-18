"use client";

import { useEffect, useState } from "react";
import {
  LEADERBOARD_RANK_BY,
  LEADERBOARD_RANK_BY_LABELS,
  LEADERBOARD_VISIBILITIES,
  LEADERBOARD_VISIBILITY_LABELS,
  MAX_FIRST_SOLVE_BONUSES,
  computePuzzlePoints,
  describePuzzleScoring,
  type PuzzleLeaderboardOptions,
  type PuzzleScoring
} from "@nexa-chess/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";

/**
 * Editors for live-class puzzle points and leaderboard rules. Shared by the
 * admin defaults page, the puzzle form (per-puzzle override), the coach's share
 * dialog and the mid-class "Edit points" dialog, so every surface offers the
 * same options with the same limits (`puzzle-scoring.ts` in @nexa-chess/types).
 *
 * `onChange` reports the key that changed, so a caller building an *override*
 * can send only what the user actually touched.
 */

function NumberField({
  id,
  label,
  hint,
  max,
  min = 0,
  value,
  onChange
}: {
  id: string;
  label: string;
  hint?: string;
  max: number;
  min?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  // Typed freely, committed (clamped) on blur: clamping every keystroke turns
  // "1" on the way to "15" into the minimum, and an emptied field into 0.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.trunc(Number(draft));
    onChange(draft.trim() !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
    setDraft(null);
  };
  return (
    <FormField id={id} label={label} hint={hint}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft ?? (Number.isFinite(value) ? value : "")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </FormField>
  );
}

function parseBonuses(text: string): number[] {
  return text
    .split(/[,\s]+/)
    // An empty string is Number("") === 0: drop blanks before converting.
    .filter(Boolean)
    .map((part) => Math.trunc(Number(part)))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((n) => Math.min(10_000, n))
    .slice(0, MAX_FIRST_SOLVE_BONUSES);
}

export function PuzzleScoringFields({
  idPrefix,
  value,
  onChange,
  hideTries = false
}: {
  idPrefix: string;
  value: PuzzleScoring;
  onChange: (next: PuzzleScoring, key: keyof PuzzleScoring) => void;
  /** For callers with their own tries setting (a puzzle-set assignment's "Tries per puzzle"). */
  hideTries?: boolean;
}) {
  const set = <K extends keyof PuzzleScoring>(key: K, next: PuzzleScoring[K]) =>
    onChange({ ...value, [key]: next }, key);

  // Free text while typing ("30, " is a valid intermediate state), parsed on change.
  const [bonusText, setBonusText] = useState(value.firstSolveBonuses.join(", "));
  useEffect(() => {
    if (parseBonuses(bonusText).join(",") !== value.firstSolveBonuses.join(",")) {
      setBonusText(value.firstSolveBonuses.join(", "));
    }
    // Only resync when the value changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.firstSolveBonuses]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <NumberField
        id={`${idPrefix}-base`}
        label="Points for solving"
        max={10_000}
        value={value.basePoints}
        onChange={(n) => set("basePoints", n)}
      />
      <NumberField
        id={`${idPrefix}-wrong`}
        label="Minus per wrong move"
        hint="Negative marking. 0 = no penalty."
        max={1_000}
        value={value.wrongMovePenalty}
        onChange={(n) => set("wrongMovePenalty", n)}
      />
      <NumberField
        id={`${idPrefix}-hint`}
        label="Minus per hint"
        max={1_000}
        value={value.hintPenalty}
        onChange={(n) => set("hintPenalty", n)}
      />
      {hideTries ? null : (
      <FormField id={`${idPrefix}-tries`} label="Tries per student">
        <Select
          id={`${idPrefix}-tries`}
          value={value.maxAttempts === null ? "" : String(value.maxAttempts)}
          onChange={(e) => set("maxAttempts", e.target.value ? Number(e.target.value) : null)}
          options={[
            { label: "Unlimited (best counts)", value: "" },
            ...[1, 2, 3, 5, 10].map((n) => ({ label: n === 1 ? "1 try" : `${n} tries`, value: String(n) }))
          ]}
        />
      </FormField>
      )}
      <NumberField
        id={`${idPrefix}-speed`}
        label="Speed bonus (max)"
        hint="Extra points for a fast solve. 0 = off."
        max={10_000}
        value={value.speedBonusMax}
        onChange={(n) => set("speedBonusMax", n)}
      />
      <NumberField
        id={`${idPrefix}-speed-window`}
        label="Speed bonus lasts (seconds)"
        hint="Shrinks to 0 over this time."
        min={10}
        max={3_600}
        value={value.speedBonusSeconds}
        onChange={(n) => set("speedBonusSeconds", n)}
      />
      <FormField
        id={`${idPrefix}-first`}
        label="Bonus for first solvers"
        hint={`Comma-separated: 1st, 2nd, 3rd… (up to ${MAX_FIRST_SOLVE_BONUSES}). e.g. 30, 20, 10`}
      >
        <Input
          id={`${idPrefix}-first`}
          value={bonusText}
          placeholder="None"
          onChange={(e) => {
            setBonusText(e.target.value);
            set("firstSolveBonuses", parseBonuses(e.target.value));
          }}
        />
      </FormField>
      <div className="flex flex-col justify-center gap-1">
        <Switch
          id={`${idPrefix}-partial`}
          label="Partial points for part of the line"
          checked={value.partialCredit}
          onCheckedChange={(checked) => set("partialCredit", checked === true)}
        />
        <Switch
          id={`${idPrefix}-negative`}
          label="Allow totals below zero"
          checked={value.allowNegative}
          onCheckedChange={(checked) => set("allowNegative", checked === true)}
        />
      </div>
    </div>
  );
}

/** Plain-language summary plus two worked examples, from the shared calculator. */
export function PuzzleScoringPreview({ scoring }: { scoring: PuzzleScoring }) {
  const clean = computePuzzlePoints(scoring, {
    durationSeconds: 20,
    hintsUsed: 0,
    scorePercent: 100,
    solveOrder: 1,
    solved: true,
    wrongMoves: 0
  });
  const messy = computePuzzlePoints(scoring, {
    durationSeconds: 90,
    hintsUsed: 0,
    scorePercent: 100,
    solveOrder: null,
    solved: true,
    wrongMoves: 2
  });
  const half = computePuzzlePoints(scoring, {
    durationSeconds: 60,
    hintsUsed: 0,
    scorePercent: 50,
    solveOrder: null,
    solved: false,
    wrongMoves: 1
  });

  return (
    <div className="rounded-control border border-app-border bg-app-soft/40 p-3 text-xs text-app-muted">
      <ul className="list-disc space-y-0.5 pl-4">
        {describePuzzleScoring(scoring).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2 font-semibold text-app-text">Examples</p>
      <ul className="mt-0.5 space-y-0.5">
        <li>First to solve, clean, 20s → <strong className="text-app-text">{clean.total} pts</strong></li>
        <li>Solves after 2 wrong moves, 90s → <strong className="text-app-text">{messy.total} pts</strong></li>
        <li>Gets half the line, 1 wrong move → <strong className="text-app-text">{half.total} pts</strong></li>
      </ul>
    </div>
  );
}

export function PuzzleLeaderboardFields({
  idPrefix,
  value,
  onChange
}: {
  idPrefix: string;
  value: PuzzleLeaderboardOptions;
  onChange: (next: PuzzleLeaderboardOptions, key: keyof PuzzleLeaderboardOptions) => void;
}) {
  const set = <K extends keyof PuzzleLeaderboardOptions>(key: K, next: PuzzleLeaderboardOptions[K]) =>
    onChange({ ...value, [key]: next }, key);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField id={`${idPrefix}-visibility`} label="Students see the leaderboard">
        <Select
          id={`${idPrefix}-visibility`}
          value={value.visibility}
          onChange={(e) => set("visibility", e.target.value as PuzzleLeaderboardOptions["visibility"])}
          options={LEADERBOARD_VISIBILITIES.map((v) => ({ label: LEADERBOARD_VISIBILITY_LABELS[v], value: v }))}
        />
      </FormField>
      <FormField id={`${idPrefix}-rank`} label="Rank by">
        <Select
          id={`${idPrefix}-rank`}
          value={value.rankBy}
          onChange={(e) => set("rankBy", e.target.value as PuzzleLeaderboardOptions["rankBy"])}
          options={LEADERBOARD_RANK_BY.map((v) => ({ label: LEADERBOARD_RANK_BY_LABELS[v], value: v }))}
        />
      </FormField>
      <FormField id={`${idPrefix}-top`} label="Students see" hint="They always see their own row.">
        <Select
          id={`${idPrefix}-top`}
          value={value.topN === null ? "" : String(value.topN)}
          onChange={(e) => set("topN", e.target.value ? Number(e.target.value) : null)}
          options={[
            { label: "Everyone", value: "" },
            ...[3, 5, 10].map((n) => ({ label: `Top ${n}`, value: String(n) }))
          ]}
        />
      </FormField>
      <div className="flex flex-col justify-center gap-1">
        <Switch
          id={`${idPrefix}-anon`}
          label="Hide other students' names"
          checked={value.anonymize}
          onCheckedChange={(checked) => set("anonymize", checked === true)}
        />
        <Switch
          id={`${idPrefix}-stats`}
          label="Show time, wrong moves and hints"
          checked={value.showStats}
          onCheckedChange={(checked) => set("showStats", checked === true)}
        />
      </div>
    </div>
  );
}
