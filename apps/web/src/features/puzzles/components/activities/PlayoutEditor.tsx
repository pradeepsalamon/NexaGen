"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  ACTIVITY_MAX_ATTEMPTS,
  describePlayoutGoal,
  PLAYOUT_ENGINE_PRESETS,
  PLAYOUT_GOAL_TYPES,
  PLAYOUT_GOAL_TYPE_LABELS,
  PLAYOUT_LOCKABLE_PIECES,
  PLAYOUT_MAX_HINTS,
  PLAYOUT_MOVETIME_MAX_MS,
  PLAYOUT_MOVETIME_MIN_MS,
  type PlayoutConfig,
  type PlayoutGoal,
  type PlayoutGoalType
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { PositionEditor } from "@/features/chessboard/components/board/PositionEditor";

export const PLAYOUT_TEMPLATES: { label: string; title: string; fen: string; goal: PlayoutGoal; color?: "white" | "black" }[] = [
  { fen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1", goal: { type: "CHECKMATE" }, label: "Single rook mate", title: "Single Rook Mate" },
  { fen: "8/8/8/4k3/8/8/8/3QK3 w - - 0 1", goal: { type: "CHECKMATE" }, label: "King and queen mate", title: "King and Queen Mate" },
  { fen: "8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1", goal: { type: "CHECKMATE" }, label: "Two bishops mate", title: "Two Bishops Mate" },
  { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", goal: { type: "CHECKMATE" }, label: "Back rank mate", title: "Back Rank Mate" },
  { fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1", goal: { type: "PROMOTE" }, label: "King and pawn: promote", title: "King and Pawn Endgame" },
  {
    fen: "4k3/8/8/4K3/8/4P3/8/8 w - - 0 1",
    goal: { placements: [{ piece: "K", square: "e6" }, { piece: "k", square: "e8" }], sideToMove: "black", type: "PIECES_ON_SQUARES" },
    label: "Take the opposition",
    title: "Opposition"
  },
  { fen: "4k3/8/8/8/8/8/1r6/R3K3 w - - 0 1", goal: { points: 5, type: "MATERIAL_ADVANTAGE" }, label: "Rook ending: win the rook", title: "Rook Endgame" }
];

export function emptyPlayoutConfig(): PlayoutConfig {
  return {
    engine: { movetimeMs: 500, skillLevel: 5 },
    goal: { type: "CHECKMATE" },
    goalDescription: null,
    hints: [],
    maxAttempts: 3,
    restrictions: { lockedPieces: [], maxStudentMoves: null },
    scoring: { drawPoints: 0, goalPoints: 10, hintPenalty: 1, parBonus: 0, parMoves: null, retryPenalty: 0 },
    startFen: PLAYOUT_TEMPLATES[0].fen,
    studentColor: "white",
    timeLimitSeconds: null
  };
}

function defaultGoal(type: PlayoutGoalType, startFen: string): PlayoutGoal {
  switch (type) {
    case "PROMOTE":
      return { type };
    case "REACH_POSITION":
      return { placement: startFen.split(" ")[0], type };
    case "MATERIAL_ADVANTAGE":
      return { points: 3, type };
    case "PIECES_ON_SQUARES":
      return { placements: [{ piece: "K", square: "e6" }], type };
    default:
      return { type };
  }
}

const PIECE_OPTIONS = [
  ["K", "White king"],
  ["Q", "White queen"],
  ["R", "White rook"],
  ["B", "White bishop"],
  ["N", "White knight"],
  ["P", "White pawn"],
  ["k", "Black king"],
  ["q", "Black queen"],
  ["r", "Black rook"],
  ["b", "Black bishop"],
  ["n", "Black knight"],
  ["p", "Black pawn"]
].map(([value, label]) => ({ label, value }));

const PIECE_NAMES: Record<string, string> = { b: "Bishops", k: "King", n: "Knights", p: "Pawns", q: "Queens", r: "Rooks" };

const SIDE_OPTIONS = [
  { label: "White to move", value: "white" },
  { label: "Black to move", value: "black" }
];

const numberOf = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function GoalFields({ config, set }: { config: PlayoutConfig; set: (patch: Partial<PlayoutConfig>) => void }) {
  const { goal } = config;
  const setGoal = (next: PlayoutGoal) => set({ goal: next });
  return (
    <div className="space-y-3">
      <FormField id="po-goal" label="Goal">
        <Select
          id="po-goal"
          value={goal.type}
          options={PLAYOUT_GOAL_TYPES.map((value) => ({ label: PLAYOUT_GOAL_TYPE_LABELS[value], value }))}
          onChange={(e) => setGoal(defaultGoal(e.target.value as PlayoutGoalType, config.startFen))}
        />
      </FormField>

      {goal.type === "PROMOTE" ? (
        <FormField id="po-goal-piece" label="Promote to">
          <Select
            id="po-goal-piece"
            value={goal.piece ?? ""}
            placeholder="Any piece"
            options={[
              { label: "Queen", value: "q" },
              { label: "Rook", value: "r" },
              { label: "Bishop", value: "b" },
              { label: "Knight", value: "n" }
            ]}
            onChange={(e) => setGoal({ piece: (e.target.value || null) as "q" | "r" | "b" | "n" | null, type: "PROMOTE" })}
          />
        </FormField>
      ) : null}

      {goal.type === "MATERIAL_ADVANTAGE" ? (
        <FormField id="po-goal-points" label="Lead in points (pawn 1, knight/bishop 3, rook 5, queen 9)">
          <Input
            id="po-goal-points"
            type="number"
            min={1}
            max={39}
            value={goal.points}
            onChange={(e) => setGoal({ points: numberOf(e.target.value, 1), type: "MATERIAL_ADVANTAGE" })}
          />
        </FormField>
      ) : null}

      {goal.type === "REACH_POSITION" ? (
        <div className="space-y-3 rounded-app border border-app-border p-3">
          <p className="text-sm font-semibold text-app-text">Target position</p>
          <PositionEditor
            value={`${goal.placement} w - - 0 1`}
            showDetails={false}
            onChange={(fen) => setGoal({ ...goal, placement: fen.split(" ")[0] })}
          />
          <FormField id="po-goal-side" label="Side to move in that position">
            <Select
              id="po-goal-side"
              value={goal.sideToMove ?? ""}
              placeholder="Either"
              options={SIDE_OPTIONS}
              onChange={(e) => setGoal({ ...goal, sideToMove: (e.target.value || null) as "white" | "black" | null })}
            />
          </FormField>
        </div>
      ) : null}

      {goal.type === "PIECES_ON_SQUARES" ? (
        <div className="space-y-2 rounded-app border border-app-border p-3">
          <p className="text-sm font-semibold text-app-text">All of these at once</p>
          {goal.placements.map((placement, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={`Piece ${index + 1}`}
                className="w-44"
                value={placement.piece}
                options={PIECE_OPTIONS}
                onChange={(e) =>
                  setGoal({ ...goal, placements: goal.placements.map((p, i) => (i === index ? { ...p, piece: e.target.value } : p)) })
                }
              />
              <span className="text-sm text-app-muted">on</span>
              <Input
                aria-label={`Square ${index + 1}`}
                className="w-20"
                maxLength={2}
                value={placement.square}
                onChange={(e) =>
                  setGoal({ ...goal, placements: goal.placements.map((p, i) => (i === index ? { ...p, square: e.target.value.toLowerCase() } : p)) })
                }
              />
              <SimpleTooltip label="Remove">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove piece ${index + 1}`}
                  disabled={goal.placements.length === 1}
                  className="size-8 rounded-full text-app-danger-ink hover:bg-app-danger/10"
                  onClick={() => setGoal({ ...goal, placements: goal.placements.filter((_, i) => i !== index) })}
                >
                  <Trash2 className="size-4" strokeWidth={2.5} />
                </Button>
              </SimpleTooltip>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={goal.placements.length >= 8}
              onClick={() => setGoal({ ...goal, placements: [...goal.placements, { piece: "k", square: "e8" }] })}
            >
              <Plus className="mr-1.5 size-4" strokeWidth={2.5} /> Add a piece
            </Button>
            <Select
              aria-label="Side to move"
              className="w-40"
              value={goal.sideToMove ?? ""}
              placeholder="Either side to move"
              options={SIDE_OPTIONS}
              onChange={(e) => setGoal({ ...goal, sideToMove: (e.target.value || null) as "white" | "black" | null })}
            />
          </div>
        </div>
      ) : null}

      <FormField id="po-goal-text" label="Goal as students see it (optional)">
        <Input
          id="po-goal-text"
          maxLength={300}
          value={config.goalDescription ?? ""}
          placeholder={describePlayoutGoal(goal)}
          onChange={(e) => set({ goalDescription: e.target.value })}
        />
      </FormField>
    </div>
  );
}

/** Everything a Playout needs, set once here. A coach never configures any of it in class. */
export function PlayoutEditor({
  config,
  onChange,
  onTemplate
}: {
  config: PlayoutConfig;
  onChange: (next: PlayoutConfig) => void;
  /** A starter position was chosen: the form can take its title. */
  onTemplate: (title: string) => void;
}) {
  const set = (patch: Partial<PlayoutConfig>) => onChange({ ...config, ...patch });
  const setScoring = (patch: Partial<PlayoutConfig["scoring"]>) => set({ scoring: { ...config.scoring, ...patch } });
  const setEngine = (patch: Partial<PlayoutConfig["engine"]>) => set({ engine: { ...config.engine, ...patch } });
  const setRules = (patch: Partial<PlayoutConfig["restrictions"]>) => set({ restrictions: { ...config.restrictions, ...patch } });

  return (
    <div className="space-y-5">
      <FormField id="po-template" label="Start from a common exercise (optional)">
        <Select
          id="po-template"
          value=""
          placeholder="Choose an exercise…"
          options={PLAYOUT_TEMPLATES.map((t) => ({ label: t.label, value: t.label }))}
          onChange={(e) => {
            const template = PLAYOUT_TEMPLATES.find((t) => t.label === e.target.value);
            if (!template) return;
            set({ goal: template.goal, startFen: template.fen, studentColor: template.color ?? "white" });
            onTemplate(template.title);
          }}
        />
      </FormField>

      <section aria-label="Starting position" className="space-y-2">
        <h3 className="font-semibold text-app-text">Starting position</h3>
        <p className="text-sm text-app-muted">Set it up on the board, or paste a FEN below it. You can copy the FEN out from there too.</p>
        <PositionEditor value={config.startFen} onChange={(startFen) => set({ startFen })} orientation={config.studentColor} />
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="po-color" label="Student plays">
          <Select
            id="po-color"
            value={config.studentColor}
            options={[
              { label: "White (computer plays Black)", value: "white" },
              { label: "Black (computer plays White)", value: "black" }
            ]}
            onChange={(e) => set({ studentColor: e.target.value as "white" | "black" })}
          />
        </FormField>
        <FormField id="po-engine" label="Computer strength">
          <Select
            id="po-engine"
            value={String(config.engine.skillLevel)}
            options={PLAYOUT_ENGINE_PRESETS.map((p) => ({ label: `${p.label} (level ${p.skillLevel})`, value: String(p.skillLevel) }))}
            onChange={(e) => setEngine({ skillLevel: numberOf(e.target.value, 5) })}
          />
        </FormField>
        <FormField id="po-movetime" label="Computer thinking time (ms)">
          <Input
            id="po-movetime"
            type="number"
            min={PLAYOUT_MOVETIME_MIN_MS}
            max={PLAYOUT_MOVETIME_MAX_MS}
            step={100}
            value={config.engine.movetimeMs}
            onChange={(e) => setEngine({ movetimeMs: numberOf(e.target.value, 500) })}
          />
        </FormField>
        <FormField id="po-timer" label="Timer in seconds (optional)">
          <Input
            id="po-timer"
            type="number"
            min={10}
            max={3600}
            value={config.timeLimitSeconds ?? ""}
            placeholder="No timer"
            onChange={(e) => set({ timeLimitSeconds: e.target.value ? numberOf(e.target.value, 300) : null })}
          />
        </FormField>
      </div>

      <GoalFields config={config} set={set} />

      <section aria-label="Scoring and tries" className="space-y-2">
        <h3 className="font-semibold text-app-text">Scoring and tries</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="po-points" label="Points for the goal">
            <Input id="po-points" type="number" min={0} max={1000} value={config.scoring.goalPoints} onChange={(e) => setScoring({ goalPoints: numberOf(e.target.value, 10) })} />
          </FormField>
          <FormField id="po-draw" label="Points for a draw (when the goal is something else)">
            <Input id="po-draw" type="number" min={0} max={1000} value={config.scoring.drawPoints} onChange={(e) => setScoring({ drawPoints: numberOf(e.target.value, 0) })} />
          </FormField>
          <FormField id="po-tries" label="Tries">
            <Input id="po-tries" type="number" min={1} max={ACTIVITY_MAX_ATTEMPTS} value={config.maxAttempts} onChange={(e) => set({ maxAttempts: numberOf(e.target.value, 1) })} />
          </FormField>
          <FormField id="po-retry" label="Points off for each extra try">
            <Input id="po-retry" type="number" min={0} max={100} value={config.scoring.retryPenalty} onChange={(e) => setScoring({ retryPenalty: numberOf(e.target.value, 0) })} />
          </FormField>
          <FormField id="po-par" label="Bonus if done within this many moves (optional)">
            <Input
              id="po-par"
              type="number"
              min={1}
              max={200}
              value={config.scoring.parMoves ?? ""}
              placeholder="No bonus"
              onChange={(e) => setScoring({ parMoves: e.target.value ? numberOf(e.target.value, 10) : null })}
            />
          </FormField>
          <FormField id="po-bonus" label="Bonus points">
            <Input id="po-bonus" type="number" min={0} max={100} disabled={!config.scoring.parMoves} value={config.scoring.parBonus} onChange={(e) => setScoring({ parBonus: numberOf(e.target.value, 0) })} />
          </FormField>
        </div>
      </section>

      <section aria-label="Hints" className="space-y-2">
        <h3 className="font-semibold text-app-text">Hints (optional)</h3>
        <p className="text-sm text-app-muted">Words you write yourself: the computer never suggests a move to the student.</p>
        {config.hints.map((hint, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`Hint ${index + 1}`}
              maxLength={300}
              value={hint}
              onChange={(e) => set({ hints: config.hints.map((h, i) => (i === index ? e.target.value : h)) })}
            />
            <SimpleTooltip label="Remove hint">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove hint ${index + 1}`}
                className="size-8 shrink-0 rounded-full text-app-danger-ink hover:bg-app-danger/10"
                onClick={() => set({ hints: config.hints.filter((_, i) => i !== index) })}
              >
                <Trash2 className="size-4" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" size="sm" variant="outline" disabled={config.hints.length >= PLAYOUT_MAX_HINTS} onClick={() => set({ hints: [...config.hints, ""] })}>
            <Plus className="mr-1.5 size-4" strokeWidth={2.5} /> Add hint
          </Button>
          <div className="w-44">
            <FormField id="po-hint-penalty" label="Points off per hint">
              <Input id="po-hint-penalty" type="number" min={0} max={100} value={config.scoring.hintPenalty} onChange={(e) => setScoring({ hintPenalty: numberOf(e.target.value, 0) })} />
            </FormField>
          </div>
        </div>
      </section>

      <section aria-label="Move restrictions" className="space-y-2">
        <h3 className="font-semibold text-app-text">Move restrictions (optional)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="po-max" label="The student fails after this many of their moves">
            <Input
              id="po-max"
              type="number"
              min={1}
              max={200}
              value={config.restrictions.maxStudentMoves ?? ""}
              placeholder="No limit"
              onChange={(e) => setRules({ maxStudentMoves: e.target.value ? numberOf(e.target.value, 20) : null })}
            />
          </FormField>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-app-text">Pieces the student may not move</legend>
            <div className="flex flex-wrap gap-3">
              {PLAYOUT_LOCKABLE_PIECES.map((piece) => (
                <label key={piece} className="flex items-center gap-1.5 text-sm text-app-text">
                  <Checkbox
                    checked={config.restrictions.lockedPieces.includes(piece)}
                    aria-label={`Lock ${PIECE_NAMES[piece]}`}
                    onCheckedChange={(value) =>
                      setRules({
                        lockedPieces:
                          value === true
                            ? [...config.restrictions.lockedPieces, piece]
                            : config.restrictions.lockedPieces.filter((p) => p !== piece)
                      })
                    }
                  />
                  {PIECE_NAMES[piece]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>
    </div>
  );
}
