import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type PuzzleRushMode,
  type PuzzleRushStateResponse,
  type ReportPuzzleRushProgressRequest,
  type ReportPuzzleRushProgressResponse
} from "@nexa-chess/types";

export const getPuzzleRush = (classId: string): Promise<PuzzleRushStateResponse> =>
  apiFetch<PuzzleRushStateResponse>(API_ROUTES.liveClass.puzzleRush(classId));

export const startPuzzleRush = (classId: string, mode: PuzzleRushMode): Promise<PuzzleRushStateResponse> =>
  apiFetch<PuzzleRushStateResponse>(API_ROUTES.liveClass.puzzleRush(classId), { method: "POST", body: { mode } });

export const endPuzzleRush = (classId: string): Promise<PuzzleRushStateResponse> =>
  apiFetch<PuzzleRushStateResponse>(API_ROUTES.liveClass.puzzleRush(classId), { method: "DELETE" });

export const reportPuzzleRushProgress = (
  classId: string,
  body: ReportPuzzleRushProgressRequest
): Promise<ReportPuzzleRushProgressResponse> =>
  apiFetch<ReportPuzzleRushProgressResponse>(API_ROUTES.liveClass.puzzleRushProgress(classId), {
    method: "PUT",
    body
  });
