import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startLiveClass } from "../api/live-class";
import { useToast } from "@/providers/ToastProvider";
import { queryKeys } from "@/lib/queryKeys";

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
