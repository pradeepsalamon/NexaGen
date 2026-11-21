import {
  API_ROUTES,
  type DailyPuzzleLevel,
  type DailyPuzzleScheduleResponse,
  type DailyPuzzleScheduleSlot,
  type DailyPuzzleSettingsResponse,
  type DailyPuzzleTodayResponse,
  type SetDailyPuzzleOverrideRequest,
  type StartDailyPuzzleResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export const getDailyPuzzleToday = (): Promise<DailyPuzzleTodayResponse> =>
  apiFetch<DailyPuzzleTodayResponse>(API_ROUTES.dailyPuzzle.today);

export const startDailyPuzzle = (level: DailyPuzzleLevel): Promise<StartDailyPuzzleResponse & { finished: boolean }> =>
  apiFetch(API_ROUTES.dailyPuzzle.start, { body: { level }, method: "POST" });

export const getDailyPuzzleSchedule = (batchId: string | null): Promise<DailyPuzzleScheduleResponse> => {
  const sp = new URLSearchParams(batchId ? { batchId } : {});
  const query = sp.toString();
  return apiFetch<DailyPuzzleScheduleResponse>(`${API_ROUTES.dailyPuzzle.schedule}${query ? `?${query}` : ""}`);
};

export const setDailyPuzzleOverride = (body: SetDailyPuzzleOverrideRequest): Promise<DailyPuzzleScheduleSlot> =>
  apiFetch<DailyPuzzleScheduleSlot>(API_ROUTES.dailyPuzzle.overrides, { body, method: "PUT" });

export const updateDailyPuzzleSettings = (enabled: boolean): Promise<DailyPuzzleSettingsResponse> =>
  apiFetch<DailyPuzzleSettingsResponse>(API_ROUTES.dailyPuzzle.settings, { body: { enabled }, method: "PUT" });

export const updateBatchDailyPuzzle = (batchId: string, enabled: boolean): Promise<{ batchId: string; enabled: boolean }> =>
  apiFetch(API_ROUTES.dailyPuzzle.batch(batchId), { body: { enabled }, method: "PATCH" });
