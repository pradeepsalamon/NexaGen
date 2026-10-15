"use client";

import type { ToolContext } from "../shared";
import { RushCoachPanel } from "./puzzle-rush/RushCoachPanel";
import { RushPlayer } from "./puzzle-rush/RushPlayer";

/** Lichess Puzzle Storm: the coach opens a round, every student plays their own 3-minute run. */
export function PuzzleStormTool({ classId, isManager }: ToolContext) {
  return isManager ? <RushCoachPanel classId={classId} mode="STORM" /> : <RushPlayer classId={classId} mode="STORM" />;
}
