import { useCallback, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/providers/ToastProvider";
import { UndoableMutationConfig, UndoableMutationResult } from "./types";

export function useUndoableMutation<TVars, TResult>(
  config: UndoableMutationConfig<TVars, TResult>
): UndoableMutationResult<TVars> {
  const [isPending, setIsPending] = useState(false);
  const inFlight = useRef(false);
  const { undoable, error: showError, showToast, info } = useToast();
  const queryClient = useQueryClient();

  // Extract config values to avoid dependency issues if config object is re-created every render
  const {
    strategy,
    delayMs,
    mutationFn,
    undo,
    toast,
    undoToast,
    invalidates,
    onSchedule,
    onCancel,
    onCommitSuccess
  } = config;

  const run = useCallback(
    async (vars: TVars): Promise<void> => {
      // A failed refetch must not turn a completed action into an error.
      const invalidateAll = () =>
        Promise.allSettled(
          invalidates.map((key) => queryClient.invalidateQueries({ queryKey: key }))
        );

      if (strategy === "defer") {
        const toastCopy = toast(vars);
        onSchedule?.(vars);
        undoable({
          title: toastCopy.title,
          message: toastCopy.message,
          delayMs: delayMs,
          onUndo: () => onCancel?.(vars),
          onCommit: async () => {
            try {
              const result = await mutationFn(vars);
              await invalidateAll();
              onCommitSuccess?.(vars, result);
            } catch (err) {
              onCancel?.(vars);
              Sentry.captureException(err);
              showError({
                title: "Action failed",
                message: err instanceof Error ? err.message : "An error occurred"
              });
            }
          }
        });
      } else {
        // strategy === "immediate"; a double click must not run the action twice.
        if (inFlight.current) return;
        inFlight.current = true;
        setIsPending(true);
        try {
          const result = await mutationFn(vars);
          await invalidateAll();

          const toastCopy = toast(vars, result);

          showToast({
            type: "success",
            title: toastCopy.title,
            message: toastCopy.message,
            durationMs: 5000,
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  await undo(vars, result);
                  await invalidateAll();
                  const undoToastCopy = undoToast?.(vars) ?? { title: "Action undone." };
                  info(undoToastCopy);
                } catch (err) {
                   showError({
                     title: "Undo failed",
                     message: err instanceof Error ? err.message : "An error occurred"
                   });
                }
              }
            }
          });
        } catch (err) {
          showError({
            title: "Action failed",
            message: err instanceof Error ? err.message : "An error occurred"
          });
        } finally {
          inFlight.current = false;
          setIsPending(false);
        }
      }
    },
    [
      strategy,
      delayMs,
      mutationFn,
      undo,
      toast,
      undoToast,
      invalidates,
      onSchedule,
      onCancel,
      onCommitSuccess,
      queryClient,
      undoable,
      showError,
      showToast,
      info
    ]
  );

  return { run, isPending };
}
