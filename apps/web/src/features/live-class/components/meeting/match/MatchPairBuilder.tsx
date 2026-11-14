"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Plus, Shuffle, X } from "lucide-react";
import { autoPairPlayers, type MatchPair } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";

export type PairableStudent = { id: string; name: string };

/** Coach builds White-vs-Black pairs from the free students. */
export function MatchPairBuilder({
  students,
  pairs,
  onChange
}: {
  students: PairableStudent[];
  pairs: MatchPair[];
  onChange: (pairs: MatchPair[]) => void;
}) {
  const names = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);
  const used = new Set(pairs.flatMap((p) => [p.whiteId, p.blackId]));
  const free = students.filter((s) => !used.has(s.id));
  const [whiteId, setWhiteId] = useState("");
  const [blackId, setBlackId] = useState("");

  const options = (exclude: string) => [
    { label: "Choose a student", value: "" },
    ...free.filter((s) => s.id !== exclude).map((s) => ({ label: s.name, value: s.id }))
  ];

  const add = () => {
    if (!whiteId || !blackId || whiteId === blackId) return;
    onChange([...pairs, { blackId, whiteId }]);
    setWhiteId("");
    setBlackId("");
  };

  const pairRest = () => {
    const { pairs: more } = autoPairPlayers(free.map((s) => ({ id: s.id, points: 0 })));
    onChange([...pairs, ...more]);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2">
        <label className="space-y-1 text-xs font-medium text-app-muted">
          White
          <Select aria-label="White player" value={whiteId} onChange={(e) => setWhiteId(e.target.value)} options={options(blackId)} />
        </label>
        <span className="pb-2.5 text-xs text-app-muted">vs</span>
        <label className="space-y-1 text-xs font-medium text-app-muted">
          Black
          <Select aria-label="Black player" value={blackId} onChange={(e) => setBlackId(e.target.value)} options={options(whiteId)} />
        </label>
        <SimpleTooltip label="Add pair">
          <Button size="icon" className="rounded-full" aria-label="Add pair" onClick={add} disabled={!whiteId || !blackId}>
            <Plus className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={pairRest} disabled={free.length < 2}>
          <Shuffle className="mr-1.5 size-4" />
          Pair the rest randomly
        </Button>
        {pairs.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            Clear pairs
          </Button>
        ) : null}
        <span className="ml-auto text-xs text-app-muted">
          {free.length} unpaired{free.length === 1 ? " (sits out)" : ""}
        </span>
      </div>

      {pairs.length > 0 ? (
        <ol className="space-y-1 rounded-app border border-app-border p-2">
          {pairs.map((p, i) => (
            <li key={`${p.whiteId}-${p.blackId}`} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-xs text-app-muted">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-app-text">{names.get(p.whiteId) ?? "Student"}</span>
                <span className="mx-1.5 text-app-muted">vs</span>
                <span className="font-medium text-app-text">{names.get(p.blackId) ?? "Student"}</span>
              </span>
              <SimpleTooltip label="Swap colours">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 rounded-full"
                  aria-label="Swap colours"
                  onClick={() =>
                    onChange(pairs.map((q, j) => (j === i ? { blackId: q.whiteId, whiteId: q.blackId } : q)))
                  }
                >
                  <ArrowLeftRight className="size-3.5" strokeWidth={2.5} />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip label="Remove pair">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 rounded-full"
                  aria-label="Remove pair"
                  onClick={() => onChange(pairs.filter((_, j) => j !== i))}
                >
                  <X className="size-3.5" strokeWidth={2.5} />
                </Button>
              </SimpleTooltip>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
