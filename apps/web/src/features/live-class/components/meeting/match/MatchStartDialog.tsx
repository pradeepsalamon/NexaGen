"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MATCH_TIME_CONTROL_PRESETS,
  type MatchPair,
  type MatchPairingMode,
  type MatchTimeControl
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { getPullRoster } from "../../../api/live-class";
import { useStartLiveMatch } from "../../../hooks/useLiveMatch";
import { useMatch } from "../../../providers/MatchProvider";
import { MatchPairBuilder } from "./MatchPairBuilder";

const MODES: { value: MatchPairingMode; label: string; hint: string }[] = [
  { value: "AUTO", label: "Auto pair", hint: "Students are paired at random; colours are drawn." },
  { value: "COACH", label: "I'll pair", hint: "You choose who plays whom and with which colour." },
  { value: "STUDENT_CHOICE", label: "Students choose", hint: "Each student challenges a classmate in the room." }
];

function sameTimeControl(a: MatchTimeControl | null, b: MatchTimeControl | null) {
  return a?.initialSeconds === b?.initialSeconds && a?.incrementSeconds === b?.incrementSeconds;
}

export function MatchStartDialog() {
  const { classId, round, startOpen, setStartOpen, setCoachOpen } = useMatch();
  const start = useStartLiveMatch(classId);

  const roster = useQuery({
    queryKey: queryKeys.livePull.roster(classId),
    queryFn: () => getPullRoster(classId),
    enabled: startOpen
  });
  const inClass = useMemo(
    () =>
      (roster.data?.students ?? [])
        .filter((s) => s.inClass)
        .map((s) => ({ id: s.studentId, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [roster.data]
  );

  const [mode, setMode] = useState<MatchPairingMode>("AUTO");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pairs, setPairs] = useState<MatchPair[]>([]);
  const [timeControl, setTimeControl] = useState<MatchTimeControl | null>(null);
  const [startFen, setStartFen] = useState("");

  // Everyone in the room by default, each time the dialog opens.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!startOpen) {
      setSeeded(false);
      setPairs([]);
      return;
    }
    if (seeded || !roster.data) return;
    setSelected(new Set(inClass.map((s) => s.id)));
    setSeeded(true);
  }, [startOpen, roster.data, seeded, inClass]);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const ready =
    mode === "STUDENT_CHOICE" ? inClass.length >= 2 : mode === "AUTO" ? selected.size >= 2 : pairs.length > 0;
  const replacing = round?.status === "ACTIVE";

  const submit = () => {
    start.mutate(
      {
        pairingMode: mode,
        pairs: mode === "COACH" ? pairs : undefined,
        startFen: startFen.trim() || undefined,
        studentIds: mode === "AUTO" ? [...selected] : undefined,
        timeControl
      },
      {
        onSuccess: () => {
          setStartOpen(false);
          setCoachOpen(true);
        }
      }
    );
  };

  return (
    <Dialog open={startOpen} onOpenChange={setStartOpen}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" overlayClassName="bg-black/60 backdrop-blur-none">
        <DialogHeader>
          <DialogTitle>Student matches</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-app-muted">
            Students play each other while you watch every board live.
          </p>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-app-text">Pairing</h3>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Pairing">
              {MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === option.value}
                  onClick={() => setMode(option.value)}
                  className={cn(
                    "rounded-control border px-3 py-2 text-sm font-medium transition-colors",
                    mode === option.value
                      ? "border-primary bg-primary/10 text-primary-ink"
                      : "border-app-border text-app-muted hover:bg-app-soft"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-app-muted">{MODES.find((m) => m.value === mode)?.hint}</p>
          </section>

          {roster.isLoading ? (
            <p className="text-sm text-app-muted">Loading students…</p>
          ) : inClass.length < 2 ? (
            <p className="rounded-app border border-warning/40 bg-warning/10 p-3 text-xs text-warning-ink">
              At least two students need to be in class to play each other.
            </p>
          ) : mode === "AUTO" ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-app-text">
                  Players <span className="text-app-muted">({selected.size})</span>
                </h3>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(inClass.map((s) => s.id)))}>
                    Everyone
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-app border border-app-border p-2">
                {inClass.map((s) => (
                  <Checkbox
                    key={s.id}
                    id={`match-${s.id}`}
                    label={s.name}
                    checked={selected.has(s.id)}
                    onCheckedChange={(v) => toggle(s.id, v === true)}
                  />
                ))}
              </div>
              {selected.size % 2 === 1 ? (
                <p className="text-xs text-app-muted">Odd number — one student sits out until you pair them.</p>
              ) : null}
            </section>
          ) : mode === "COACH" ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-app-text">Pairs</h3>
              <MatchPairBuilder students={inClass} pairs={pairs} onChange={setPairs} />
            </section>
          ) : (
            <p className="rounded-app border border-app-border bg-app-soft p-3 text-sm text-app-muted">
              {inClass.length} students in class will see a list of classmates to challenge. You can still pair
              anyone yourself from the match view.
            </p>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-app-text">Clock</h3>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Clock">
              {MATCH_TIME_CONTROL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  role="radio"
                  aria-checked={sameTimeControl(timeControl, preset.value)}
                  onClick={() => setTimeControl(preset.value)}
                  className={cn(
                    "rounded-control border px-2 py-2 text-xs font-medium transition-colors",
                    sameTimeControl(timeControl, preset.value)
                      ? "border-primary bg-primary/10 text-primary-ink"
                      : "border-app-border text-app-muted hover:bg-app-soft"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <label htmlFor="match-fen" className="text-sm font-semibold text-app-text">
              Starting position <span className="font-normal text-app-muted">(optional FEN)</span>
            </label>
            <Input
              id="match-fen"
              value={startFen}
              onChange={(e) => setStartFen(e.target.value)}
              placeholder="Standard starting position"
            />
          </section>

          {replacing ? (
            <p className="rounded-app border border-warning/40 bg-warning/10 p-3 text-xs text-warning-ink">
              Matches are already running. Starting new ones ends them, and unfinished games stay unscored.
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!ready || start.isPending}>
              {start.isPending
                ? "Starting…"
                : mode === "COACH"
                  ? `Start ${pairs.length} ${pairs.length === 1 ? "game" : "games"}`
                  : "Start matches"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
