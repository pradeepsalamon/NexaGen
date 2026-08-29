import { useCallback, useMemo, useState, useEffect } from "react";
import { getLiveClassToken, getLiveClass } from "../api/live-class";
import { getTabClientId } from "../lib/joinedSession";
import { ApiError } from "@/lib/api";

export function useLiveClass(roomId: string, shouldFetch: boolean = true, clientId?: string) {
  // Fall back to a stable per-tab id so multiple tabs don't collide on the
  // LiveKit participant identity (AUDIT M23). The board tab passes "board".
  const resolvedClientId = useMemo(() => clientId ?? getTabClientId(), [clientId]);
  const [token, setToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Structured error code from the API (AUDIT H14) — lets callers branch on a
  // specific, known condition (e.g. "coach hasn't joined yet") instead of
  // substring-matching `error`.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [classStatus, setClassStatus] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  // Bumped by `retry()` to re-run the effect below without a page reload.
  const [retryToken, setRetryToken] = useState(0);
  // Set only for a background retry, so it doesn't flash the loading screen
  // over whatever error state the caller is already showing (AUDIT H14/H16).
  const [isSilentRetry, setIsSilentRetry] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchToken(silent: boolean) {
      try {
        if (!silent) {
          setIsLoading(true);
        }
        setError(null);
        setErrorCode(null);

        const classDetails = await getLiveClass(roomId);
        if (mounted) {
          setClassStatus(classDetails.status);
          if (classDetails.topic) {
            setTopic(classDetails.topic);
          }
          if (classDetails.startsAt) {
            setStartedAt(classDetails.startsAt);
          }
          if (classDetails.endsAt) {
            setEndsAt(classDetails.endsAt);
          }
        }

        if (classDetails.status === "COMPLETED" || classDetails.status === "CANCELLED") {
          throw new Error("Class has ended");
        }

        if (classDetails.status === "SCHEDULED") {
          throw new Error("Class has not been started yet");
        }

        if (shouldFetch) {
          const res = await getLiveClassToken(roomId, resolvedClientId);

          if (mounted) {
            setToken(res.token);
            setRoomName(res.roomName);
            if (res.topic || classDetails.topic) {
              setTopic(res.topic || classDetails.topic);
            }
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to connect to class");
          setErrorCode(err instanceof ApiError ? err.code ?? null : null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    if (roomId) {
      fetchToken(isSilentRetry);
    }

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retryToken is the re-run trigger; isSilentRetry only affects loading UX for that one run
  }, [roomId, shouldFetch, resolvedClientId, retryToken]);

  // Re-runs the fetch above without reloading the page. Pass `silent: true`
  // for background polling (e.g. "waiting for the coach to join") so it
  // doesn't flip the screen back to the loading state on every attempt.
  const retry = useCallback((options?: { silent?: boolean }) => {
    setIsSilentRetry(!!options?.silent);
    setRetryToken((n) => n + 1);
  }, []);

  return { token, roomName, topic, error, errorCode, isLoading, classStatus, startedAt, endsAt, retry };
}
