"use client";

import type { ToolContext } from "../shared";
import { RushCoachPanel } from "./puzzle-rush/RushCoachPanel";
import { RushPlayer } from "./puzzle-rush/RushPlayer";

/** Lichess Puzzle Racer: the whole class races the same puzzles for 90 seconds. */
export function PuzzleRacerTool({ classId, isManager }: ToolContext) {
  return isManager ? <RushCoachPanel classId={classId} mode="RACER" /> : <RushPlayer classId={classId} mode="RACER" />;
}
