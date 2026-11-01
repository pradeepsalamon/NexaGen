import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type ActivityRunMonitorResponse,
  type ActivityRunStateResponse,
  type ActivityRunSummary,
  type McqAnswerResponse,
  type PlayoutGameDetailResponse,
  type PlayoutGameResponse,
  type PlayoutMoveRequest,
  type SubmitMcqAnswerRequest
} from "@nexa-chess/types";

const R = API_ROUTES.liveClass;

export const getActivityRunState = (classId: string) => apiFetch<ActivityRunStateResponse>(R.activityRun(classId));

export const getActivityRunMonitor = (classId: string, runId: string) =>
  apiFetch<ActivityRunMonitorResponse>(R.activityRunMonitor(classId, runId));

export const getActivityRunGame = (classId: string, runId: string, gameId: string) =>
  apiFetch<PlayoutGameDetailResponse>(R.activityRunGame(classId, runId, gameId));

export const endActivityRun = (classId: string, runId: string) =>
  apiFetch<{ run: ActivityRunSummary }>(R.activityRunEnd(classId, runId), { method: "POST" });

export const revealActivityRun = (classId: string, runId: string) =>
  apiFetch<{ run: ActivityRunSummary }>(R.activityRunReveal(classId, runId), { method: "POST" });

export const submitMcqAnswer = (classId: string, runId: string, body: SubmitMcqAnswerRequest) =>
  apiFetch<McqAnswerResponse>(R.mcqAnswers(classId, runId), { body, method: "POST" });

export const startPlayoutGame = (classId: string, runId: string) =>
  apiFetch<PlayoutGameResponse>(R.playoutStart(classId, runId), { method: "POST" });

export const playPlayoutMove = (classId: string, runId: string, gameId: string, body: PlayoutMoveRequest) =>
  apiFetch<PlayoutGameResponse>(R.playoutMove(classId, runId, gameId), { body, method: "POST" });

export const continuePlayoutGame = (classId: string, runId: string, gameId: string) =>
  apiFetch<PlayoutGameResponse>(R.playoutContinue(classId, runId, gameId), { method: "POST" });

export const askPlayoutHint = (classId: string, runId: string, gameId: string) =>
  apiFetch<PlayoutGameResponse>(R.playoutHint(classId, runId, gameId), { method: "POST" });

export const retryPlayoutGame = (classId: string, runId: string, gameId: string) =>
  apiFetch<PlayoutGameResponse>(R.playoutRetry(classId, runId, gameId), { method: "POST" });

export const resignPlayoutGame = (classId: string, runId: string, gameId: string) =>
  apiFetch<PlayoutGameResponse>(R.playoutResign(classId, runId, gameId), { method: "POST" });
