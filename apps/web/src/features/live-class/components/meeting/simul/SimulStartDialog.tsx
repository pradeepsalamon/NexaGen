"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SIMUL_MAX_PLAYERS, type SimulColorMode } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
import { getPullRoster } from "../../../api/live-class";
import { useStartLiveSimul } from "../../../hooks/useLiveSimul";
import { useSimul } from "../../../providers/SimulProvider";

const COLOR_OPTIONS: { value: SimulColorMode; label: string }[] = [
  { value: "WHITE", label: "I play White" },
  { value: "BLACK", label: "I play Black" },
  { value: "ALTERNATE", label: "Alternate" }
];

export function SimulStartDialog() {
  const { classId, simul, startOpen, setStartOpen, setCoachOpen } = useSimul();
  const start = useStartLiveSimul(classId);

  const roster = useQuery({
    queryKey: queryKeys.livePull.roster(classId),
    queryFn: () => getPullRoster(classId),
    enabled: startOpen
  });
  const students = useMemo(
    () =>
      [...(roster.data?.students ?? [])].sort(
        (a, b) => Number(b.inClass) - Number(a.inClass) || a.name.localeCompare(b.name)
      ),
    [roster.data]
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [colorMode, setColorMode] = useState<SimulColorMode>("WHITE");
  const [startFen, setStartFen] = useState("");

  // Everyone in the room by default, each time the dialog opens.
  const [seededFor, setSeededFor] = useState(false);
  useEffect(() => {
    if (!startOpen) {
      setSeededFor(false);
      return;
    }
    if (seededFor || !roster.data) return;
    setSelected(new Set(roster.data.students.filter((s) => s.inClass).map((s) => s.studentId)));
    setSeededFor(true);
  }, [startOpen, roster.data, seededFor]);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const inClassIds = students.filter((s) => s.inClass).map((s) => s.studentId);
  const tooMany = selected.size > SIMUL_MAX_PLAYERS;
  const replacing = simul?.status === "ACTIVE";

  const submit = () => {
    start.mutate(
      {
        colorMode,
        startFen: startFen.trim() || undefined,
        studentIds: [...selected]
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
          <DialogTitle>Play a simul</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-app-muted">
            You play one game against each selected student at the same time. Boards waiting on your
            move line up first.
          </p>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-app-text">
                Players <span className="text-app-muted">({selected.size})</span>
              </h3>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(inClassIds))}>
                  Everyone in class
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set(students.map((s) => s.studentId)))}
                >
                  All
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-app border border-app-border p-2">
              {roster.isLoading ? (
                <p className="p-2 text-sm text-app-muted">Loading students…</p>
              ) : students.length === 0 ? (
                <p className="p-2 text-sm text-app-muted">No students are enrolled in this class.</p>
              ) : (
                students.map((s) => (
                  <div key={s.studentId} className="flex items-center justify-between gap-2 px-1">
                    <Checkbox
                      id={`simul-${s.studentId}`}
                      label={s.name}
                      checked={selected.has(s.studentId)}
                      onCheckedChange={(v) => toggle(s.studentId, v === true)}
                    />
                    <span className={cn("text-xs", s.inClass ? "text-success-ink" : "text-app-muted")}>
                      {s.inClass ? "In class" : "Not in class"}
                    </span>
                  </div>
                ))
              )}
            </div>
            {tooMany ? (
              <p className="text-xs text-app-danger-ink">A simul can have at most {SIMUL_MAX_PLAYERS} boards.</p>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-app-text">Your colour</h3>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Your colour">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={colorMode === option.value}
                  onClick={() => setColorMode(option.value)}
                  className={cn(
                    "rounded-control border px-3 py-2 text-sm font-medium transition-colors",
                    colorMode === option.value
                      ? "border-primary bg-primary/10 text-primary-ink"
                      : "border-app-border text-app-muted hover:bg-app-soft"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <label htmlFor="simul-fen" className="text-sm font-semibold text-app-text">
              Starting position <span className="font-normal text-app-muted">(optional FEN)</span>
            </label>
            <Input
              id="simul-fen"
              value={startFen}
              onChange={(e) => setStartFen(e.target.value)}
              placeholder="Standard starting position"
            />
          </section>

          {replacing ? (
            <p className="rounded-app border border-warning/40 bg-warning/10 p-3 text-xs text-warning-ink">
              A simul is already running. Starting a new one ends it, and unfinished games stay unscored.
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={selected.size === 0 || tooMany || start.isPending}
            >
              {start.isPending ? "Starting…" : `Start simul (${selected.size} ${selected.size === 1 ? "board" : "boards"})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
