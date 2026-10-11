"use client";

import { useRef, useState } from "react";
import { Shuffle } from "lucide-react";
import type { SidesState } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  useClassroomTool,
  useSaveClassroomTool,
} from "../../../../hooks/useClassroomTools";
import { useReducedMotion } from "../../../../lib/meetingUi";
import {
  CoachRunsThis,
  randomIndex,
  SectionTitle,
  ToolLoadError,
  ToolLoading,
  useToolRoster,
  type ToolContext,
} from "../shared";

const FLIP_MS = 1800;
const EMPTY: SidesState = { results: [] };

export function WhiteOrBlackTool({ classId, isManager }: ToolContext) {
  const tool = useClassroomTool(classId, "SIDES");
  const save = useSaveClassroomTool(classId, "SIDES");
  const roster = useToolRoster(classId, isManager);
  const reducedMotion = useReducedMotion();

  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("Coach");
  const [turns, setTurns] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [shown, setShown] = useState<{ white: string; black: string } | null>(
    null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (tool.isLoading) return <ToolLoading />;
  if (tool.isError)
    return <ToolLoadError onRetry={() => void tool.refetch()} />;

  const state = tool.state ?? EMPTY;
  const last = state.results[0] ?? null;
  const a = playerA.trim();
  const b = playerB.trim();

  const flip = () => {
    if (!a || !b || flipping) return;
    const aIsWhite = randomIndex(2) === 0;
    const result = aIsWhite ? { black: b, white: a } : { black: a, white: b };
    // Spin at least five full turns, landing on the colour Player 1 got:
    // an even number of half-turns shows the white king, odd the black one.
    setTurns((t) => {
      const next = t + 10;
      return next % 2 === (aIsWhite ? 0 : 1) ? next : next + 1;
    });
    setFlipping(true);
    setShown(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setFlipping(false);
        setShown(result);
        save.mutate({
          results: [
            { ...result, at: new Date().toISOString(), label: `${a} vs ${b}` },
            ...state.results,
          ].slice(0, 20),
        });
      },
      reducedMotion ? 50 : FLIP_MS,
    );
  };

  // The coin lands on Player 1's colour.
  const display = shown ?? (isManager ? null : last);
  const names = roster.batch.map((s) => s.name);

  return (
    <div className="space-y-4">
      {isManager ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="side-a">Player 1</Label>
            <PlayerField
              id="side-a"
              names={names}
              onChange={setPlayerA}
              value={playerA}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="side-b">Player 2</Label>
            <PlayerField
              id="side-b"
              names={["Coach", ...names]}
              onChange={setPlayerB}
              value={playerB}
            />
          </div>
        </div>
      ) : (
        <CoachRunsThis />
      )}

      <div className="flex flex-col items-center gap-3 py-2">
        <div className="[perspective:600px]">
          <div
            className="relative size-28 [transform-style:preserve-3d]"
            style={{
              transform: `rotateY(${turns * 180}deg)`,
              transition:
                flipping && !reducedMotion
                  ? `transform ${FLIP_MS}ms cubic-bezier(0.3, 1.4, 0.5, 1)`
                  : "none",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-app-border bg-app-surface text-6xl text-app-text shadow-card [backface-visibility:hidden]">
              ♔
            </div>
            <div className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-app-text bg-app-text text-6xl text-app-surface shadow-card [backface-visibility:hidden] [transform:rotateY(180deg)]">
              ♚
            </div>
          </div>
        </div>
        <div aria-live="polite" className="min-h-[3.5rem] text-center">
          {flipping ? (
            <p className="pt-3 text-sm text-app-muted">Flipping…</p>
          ) : display ? (
            <div className="animate-in fade-in zoom-in-95 space-y-0.5">
              <p className="text-lg font-extrabold text-app-text">
                <span aria-hidden="true">♔ </span>
                {display.white} plays White
              </p>
              <p className="text-sm font-bold text-app-muted">
                <span aria-hidden="true">♚ </span>
                {display.black} plays Black
              </p>
            </div>
          ) : (
            <p className="pt-3 text-sm text-app-muted">
              {isManager
                ? "Enter two players and flip."
                : "Nothing flipped yet."}
            </p>
          )}
        </div>
        {isManager ? (
          <Button disabled={!a || !b || flipping} onClick={flip}>
            <Shuffle aria-hidden="true" className="size-4" strokeWidth={2.5} />
            {shown ? "Flip again" : "Flip for colours"}
          </Button>
        ) : null}
      </div>

      {state.results.length > 0 ? (
        <div className="space-y-1.5">
          <SectionTitle>Earlier flips</SectionTitle>
          <ul className="space-y-1 text-sm">
            {state.results.slice(0, 8).map((r) => (
              <li className="flex justify-between gap-3" key={r.at}>
                <span className="truncate text-app-text">♔ {r.white}</span>
                <span className="truncate text-app-muted">♚ {r.black}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** A name field that suggests roster names but accepts any text ("Coach", a guest). */
function PlayerField({
  id,
  names,
  onChange,
  value,
}: {
  id: string;
  names: string[];
  onChange: (v: string) => void;
  value: string;
}) {
  return (
    <>
      <Input
        autoComplete="off"
        id={id}
        list={`${id}-names`}
        maxLength={60}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type or choose a name"
        value={value}
      />
      <datalist id={`${id}-names`}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  );
}
