import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  DEMO_GUEST_TOKEN_HEADER,
  type AdjustClassLeaderboardRequest,
  type AdjustLivePuzzlePointsRequest,
  type AssignLivePuzzleRequest,
  type ClassLeaderboardResponse,
  type GuestLivePuzzleResponse,
  type LivePuzzleBoardsResponse,
  type LivePuzzleLeaderboardResponse,
  type LivePuzzleStateResponse,
  type ShareLivePuzzleFromBoardRequest,
  type StartPuzzleAttemptResponse,
  type UpdateLivePuzzleRequest
} from "@nexa-chess/types";

export const getLivePuzzleState = (classId: string): Promise<LivePuzzleStateResponse> =>
  apiFetch<LivePuzzleStateResponse>(API_ROUTES.liveClass.puzzle(classId));

/** Demo guests: no session cookie — the guest token from the join goes in a header instead. */
export const getGuestLivePuzzle = (classId: string, guestToken: string): Promise<GuestLivePuzzleResponse> =>
  apiFetch<GuestLivePuzzleResponse>(API_ROUTES.liveClass.puzzleGuest(classId), {
    headers: { [DEMO_GUEST_TOKEN_HEADER]: guestToken },
    silent: true
  });

export const assignLivePuzzle = (
  classId: string,
  body: AssignLivePuzzleRequest
): Promise<LivePuzzleStateResponse> =>
  apiFetch<LivePuzzleStateResponse>(API_ROUTES.liveClass.puzzle(classId), {
    method: "POST",
    body
  });

export const shareLivePuzzleFromBoard = (
  classId: string,
  body: ShareLivePuzzleFromBoardRequest
): Promise<LivePuzzleStateResponse> =>
  apiFetch<LivePuzzleStateResponse>(API_ROUTES.liveClass.puzzleFromBoard(classId), {
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

export const getClassLeaderboard = (classId: string): Promise<ClassLeaderboardResponse> =>
  apiFetch<ClassLeaderboardResponse>(API_ROUTES.liveClass.puzzleClassLeaderboard(classId));

export const adjustClassLeaderboard = (
  classId: string,
  body: AdjustClassLeaderboardRequest
): Promise<ClassLeaderboardResponse> =>
  apiFetch<ClassLeaderboardResponse>(API_ROUTES.liveClass.puzzleClassLeaderboardAdjust(classId), {
    method: "POST",
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
