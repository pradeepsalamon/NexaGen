import { useMutation, useQueryClient } from "@tanstack/react-query";
import { endLiveClass, startLiveClass } from "../api/live-class";
import { useToast } from "@/providers/ToastProvider";
import { queryKeys } from "@/lib/queryKeys";

// undo: intentionally excluded — opens the LiveKit room and admits
// participants, an external one-way side effect (see docs/UNDO_ARCHITECTURE.md §4).
export function useStartLiveClass(roomId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => startLiveClass(roomId),
    onSuccess: () => {
      // Invalidate the class detail query so the status updates to IN_PROGRESS
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.classDetail(roomId) });
    },
    onError: (error: Error) => {
      toast.error({
        title: "Failed to start class",
        message: error.message || "An unexpected error occurred."
      });
    }
  });
}

// undo: intentionally excluded — deletes the LiveKit room and finalizes
// attendance; there is no way to reopen an ended class.
export function useEndLiveClass(roomId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => endLiveClass(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.classDetail(roomId) });
      toast.success({ title: "Class ended for everyone" });
    },
    onError: (error: Error) => {
      toast.error({
        title: "Failed to end class",
        message: error.message || "An unexpected error occurred."
      });
    }
  });
}
