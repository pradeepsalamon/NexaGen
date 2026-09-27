import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDataChannel } from "@livekit/components-react";
import {
  decodeLiveMovePoll,
  LIVE_CLASS_MOVE_POLL_TOPIC,
  type LiveMovePollStateResponse,
  type StartLiveMovePollRequest,
  type UpdateLiveMovePollRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  answerLiveMovePoll,
  endLiveMovePoll,
  getLiveMovePoll,
  startLiveMovePoll,
  updateLiveMovePoll
} from "../api/liveClassMovePoll";

export function useLiveMovePollState(classId: string) {
  return useQuery({
    queryKey: queryKeys.liveMovePoll.state(classId),
    queryFn: () => getLiveMovePoll(classId),
    enabled: !!classId,
    // Packets drive updates; the slow poll only heals a dropped one.
    refetchInterval: 20_000
  });
}

/**
 * Refetch on the API's `move_poll` packets. Students ignore answer counts
 * (they only ever see their own answer). Must render inside `<LiveKitRoom>`.
 */
export function useLiveMovePollSync(classId: string, { isManager }: { isManager: boolean }) {
  const qc = useQueryClient();
  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      const decoded = decodeLiveMovePoll(msg.payload);
      if (!decoded) return;
      if (decoded.type === "POLL_ANSWERED" && !isManager) return;
      void qc.invalidateQueries({ queryKey: queryKeys.liveMovePoll.state(classId) });
    },
    [qc, classId, isManager]
  );
  useDataChannel(LIVE_CLASS_MOVE_POLL_TOPIC, onMessage);
}

function useSetPoll(classId: string) {
  const qc = useQueryClient();
  return (data: LiveMovePollStateResponse) => qc.setQueryData(queryKeys.liveMovePoll.state(classId), data);
}

// undo: intentionally excluded — asking a question is a mid-class broadcast every
// participant sees at once, same policy as sharing a puzzle.
export function useStartLiveMovePoll(classId: string) {
  const setPoll = useSetPoll(classId);
  const toast = useToast();
  return useMutation({
    mutationFn: (body: StartLiveMovePollRequest) => startLiveMovePoll(classId, body),
    onSuccess: setPoll,
    onError: (error: Error) => toast.error({ title: "Couldn't ask the question", message: error.message })
  });
}

// undo: intentionally excluded — close/reveal is a mid-class broadcast.
export function useUpdateLiveMovePoll(classId: string) {
  const setPoll = useSetPoll(classId);
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateLiveMovePollRequest) => updateLiveMovePoll(classId, body),
    onSuccess: setPoll,
    onError: (error: Error) => toast.error({ title: "Couldn't update the question", message: error.message })
  });
}

// undo: intentionally excluded — same as useUpdateLiveMovePoll.
export function useEndLiveMovePoll(classId: string) {
  const setPoll = useSetPoll(classId);
  const toast = useToast();
  return useMutation({
    mutationFn: () => endLiveMovePoll(classId),
    onSuccess: setPoll,
    onError: (error: Error) => toast.error({ title: "Couldn't end the question", message: error.message })
  });
}

// undo: intentionally excluded — the student can simply play a different move while it's open.
export function useAnswerLiveMovePoll(classId: string) {
  const setPoll = useSetPoll(classId);
  const toast = useToast();
  return useMutation({
    mutationFn: (uci: string) => answerLiveMovePoll(classId, { uci }),
    onSuccess: setPoll,
    onError: (error: Error) => toast.error({ title: "Answer not sent", message: error.message })
  });
}
