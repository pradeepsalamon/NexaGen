import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type AdjustLivePuzzlePointsRequest,
  type AssignLivePuzzleRequest,
  type LivePuzzleBoardsResponse,
  type LivePuzzleLeaderboardResponse,
  type LivePuzzleStateResponse,
  type StartPuzzleAttemptResponse,
  type UpdateLivePuzzleRequest
} from "@nexa-chess/types";

export const getLivePuzzleState = (classId: string): Promise<LivePuzzleStateResponse> =>
  apiFetch<LivePuzzleStateResponse>(API_ROUTES.liveClass.puzzle(classId));

export const assignLivePuzzle = (
  classId: string,
  body: AssignLivePuzzleRequest
): Promise<LivePuzzleStateResponse> =>
  apiFetch<LivePuzzleStateResponse>(API_ROUTES.liveClass.puzzle(classId), {
    method: "POST",
    body
  });

export const endLivePuzzle = (classId: string): Promise<LivePuzzleStateResponse> =>
  apiFetch<LivePuzzleStateResponse>(API_ROUTES.liveClass.puzzle(classId), {
    method: "DELETE"
  });

export const startLivePuzzleAttempt = (
  classId: string
): Promise<{ attempt: StartPuzzleAttemptResponse }> =>
  apiFetch<{ attempt: StartPuzzleAttemptResponse }>(
    API_ROUTES.liveClass.puzzleAttempt(classId),
    { method: "POST" }
  );

export const getLivePuzzleLeaderboard = (
  classId: string
): Promise<LivePuzzleLeaderboardResponse> =>
  apiFetch<LivePuzzleLeaderboardResponse>(API_ROUTES.liveClass.puzzleLeaderboard(classId));

export const getLivePuzzleBoards = (classId: string): Promise<LivePuzzleBoardsResponse> =>
  apiFetch<LivePuzzleBoardsResponse>(API_ROUTES.liveClass.puzzleBoards(classId));

export const updateLivePuzzle = (
  classId: string,
  body: UpdateLivePuzzleRequest
): Promise<LivePuzzleStateResponse> =>
  apiFetch<LivePuzzleStateResponse>(API_ROUTES.liveClass.puzzle(classId), {
    method: "PATCH",
    body
  });

export const adjustLivePuzzlePoints = (
  classId: string,
  body: AdjustLivePuzzlePointsRequest
): Promise<LivePuzzleLeaderboardResponse> =>
  apiFetch<LivePuzzleLeaderboardResponse>(API_ROUTES.liveClass.puzzleAdjust(classId), {
    method: "POST",
    body
  });
