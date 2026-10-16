import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDataChannel } from "@livekit/components-react";
import {
  decodeLiveClassToolsMessage,
  LIVE_CLASS_TOOLS_TOPIC,
  type LiveClassToolKind,
  type LiveClassToolsResponse,
  type LiveClassToolStateMap,
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { getLiveClassTools, updateLiveClassTool } from "../api/liveClassTools";

/** Every Interactives tool's saved state for this class (shared by all tools). */
export function useClassroomToolsState(classId: string) {
  return useQuery({
    queryKey: queryKeys.liveClassTools.state(classId),
    queryFn: async () => {
      const res = await getLiveClassTools(classId);
      // Server time minus local time, sampled at receipt — the timer counts on it.
      return { ...res, skewMs: Date.parse(res.serverTime) - Date.now() };
    },
    enabled: !!classId,
    // Packets drive updates; the slow poll only heals a dropped one.
    refetchInterval: 30_000,
  });
}

/** One tool's state, `null` until the coach first saves it. */
export function useClassroomTool<K extends LiveClassToolKind>(
  classId: string,
  tool: K,
) {
  const query = useClassroomToolsState(classId);
  const state = (query.data?.tools[tool]?.state ?? null) as
    LiveClassToolStateMap[K] | null;
  return { ...query, skewMs: query.data?.skewMs ?? 0, state };
}

/** Refetch on the API's `classroom_tools` packets. Must render inside `<LiveKitRoom>`. */
export function useClassroomToolsSync(classId: string) {
  const qc = useQueryClient();
  const onMessage = useCallback(
    (msg: { payload: Uint8Array; from?: unknown }) => {
      // Only the API sends these; a participant-sent packet is ignored.
      if (msg.from) return;
      if (!decodeLiveClassToolsMessage(msg.payload)) return;
      void qc.invalidateQueries({
        queryKey: queryKeys.liveClassTools.state(classId),
      });
    },
    [qc, classId],
  );
  useDataChannel(LIVE_CLASS_TOOLS_TOPIC, onMessage);
}

type CachedTools = LiveClassToolsResponse & { skewMs: number };

// undo: intentionally excluded — every tool action is a live classroom moment
// (a spin, a reveal, a timer tick) broadcast to the room, like sharing a puzzle.
// Destructive resets are confirmed in the tool itself.
export function useSaveClassroomTool<K extends LiveClassToolKind>(
  classId: string,
  tool: K,
) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = useMemo(() => queryKeys.liveClassTools.state(classId), [classId]);
  return useMutation({
    mutationFn: (state: LiveClassToolStateMap[K]) =>
      updateLiveClassTool(classId, tool, { state }),
    // Optimistic: the coach's own view moves at once; the response confirms it.
    onMutate: async (state) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CachedTools>(key);
      if (previous) {
        qc.setQueryData<CachedTools>(key, {
          ...previous,
          tools: {
            ...previous.tools,
            [tool]: { state, updatedAt: new Date().toISOString() },
          },
        });
      }
      return { previous };
    },
    onError: (error: Error, _state, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
      toast.error({ title: "Couldn't save", message: error.message });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}
