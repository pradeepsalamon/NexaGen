import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DailyPuzzleLevel, DailyPuzzleWhatsAppSettings, SetDailyPuzzleOverrideRequest } from "@nexa-chess/types";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  getDailyPuzzleSchedule,
  getDailyPuzzleToday,
  setDailyPuzzleOverride,
  setDailyPuzzleWhatsApp,
  startDailyPuzzle,
  updateBatchDailyPuzzle,
  updateDailyPuzzleSettings
} from "../api/dailyPuzzleApi";

export function useDailyPuzzleToday(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: getDailyPuzzleToday,
    queryKey: queryKeys.dailyPuzzle.today
  });
}

// undo: intentionally excluded — opening today's puzzle is not an edit; it opens an attempt the student then solves.
export function useStartDailyPuzzle() {
  const toast = useToast();
  return useMutation({
    mutationFn: (level: DailyPuzzleLevel) => startDailyPuzzle(level),
    onError: (error: Error) => toast.error({ message: getErrorMessage(error), title: "Couldn't open the puzzle" })
  });
}

// undo: intentionally excluded — a switch whose correction is switching it back.
export function useSetDailyPuzzleWhatsApp() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (on: boolean) => setDailyPuzzleWhatsApp(on),
    onError: (error: Error) => toast.error({ message: getErrorMessage(error), title: "Couldn't change it" }),
    onSuccess: (status) => {
      void qc.invalidateQueries({ queryKey: queryKeys.dailyPuzzle.today });
      toast.success({ title: status.on ? "Puzzle of the Day will come on WhatsApp" : "No more WhatsApp puzzles" });
    }
  });
}

export function useDailyPuzzleSchedule(batchId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: () => getDailyPuzzleSchedule(batchId),
    queryKey: queryKeys.dailyPuzzle.schedule(batchId)
  });
}

/** Overrides and switches change what students see: refresh both sides. */
function useInvalidateDailyPuzzle() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: queryKeys.dailyPuzzle.all });
}

// undo: intentionally excluded — a schedule Save; "Reset to automatic" is the correction.
export function useSetDailyPuzzleOverride() {
  const toast = useToast();
  const invalidate = useInvalidateDailyPuzzle();
  return useMutation({
    mutationFn: (body: SetDailyPuzzleOverrideRequest) => setDailyPuzzleOverride(body),
    onError: (error: Error) => toast.error({ message: getErrorMessage(error), title: "Couldn't change the puzzle" }),
    onSuccess: (_slot, body) => {
      invalidate();
      toast.success({ title: body.puzzleId ? "Puzzle of the Day changed" : "Back to the automatic pick" });
    }
  });
}

// undo: intentionally excluded — a switch whose correction is switching it back.
export function useUpdateDailyPuzzleSwitch() {
  const toast = useToast();
  const invalidate = useInvalidateDailyPuzzle();
  return useMutation({
    mutationFn: async ({ batchId, enabled }: { batchId: string | null; enabled: boolean }) => {
      if (batchId) await updateBatchDailyPuzzle(batchId, enabled);
      else await updateDailyPuzzleSettings({ enabled });
    },
    onError: (error: Error) => toast.error({ message: getErrorMessage(error), title: "Couldn't save" }),
    onSuccess: (_res, { enabled }) => {
      invalidate();
      toast.success({ title: enabled ? "Puzzle of the Day is on" : "Puzzle of the Day is off" });
    }
  });
}

// undo: intentionally excluded — a settings Save; saving the old numbers again is the correction.
export function useSaveDailyPuzzleWhatsAppSettings() {
  const toast = useToast();
  const invalidate = useInvalidateDailyPuzzle();
  return useMutation({
    mutationFn: (whatsapp: DailyPuzzleWhatsAppSettings) => updateDailyPuzzleSettings({ whatsapp }),
    onError: (error: Error) => toast.error({ message: getErrorMessage(error), title: "Couldn't save" }),
    onSuccess: () => {
      invalidate();
      toast.success({ title: "WhatsApp puzzle settings saved" });
    }
  });
}
