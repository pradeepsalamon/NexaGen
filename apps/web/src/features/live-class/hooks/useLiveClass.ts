import { useCallback, useMemo, useState, useEffect } from "react";
import type { LiveClassSettings } from "@nexa-chess/types";
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
  const [settings, setSettings] = useState<LiveClassSettings | null>(null);
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
          // A silent (background poll) retry keeps the current error on screen
          // until it has a new result, so the "waiting for coach" screen stays
          // mounted instead of flashing back to a spinner every poll (AUDIT H14
          // follow-up).
          setError(null);
          setErrorCode(null);
        }

        const classDetails = await getLiveClass(roomId);
        if (mounted) {
          setClassStatus(classDetails.status);
          if (classDetails.topic) {
            setTopic(classDetails.topic);
          }
          // Timer elapsed runs from the actual session start, not the scheduled one (AUDIT H2).
          const actualStart = classDetails.liveSession?.startedAt ?? classDetails.startsAt;
          if (actualStart) {
            setStartedAt(actualStart);
          }
          // The countdown target respects a late start: once the class is
          // actually live, it still gets its full planned duration measured from
          // when it began, rather than being cut short at the scheduled end
          // (AUDIT H2 follow-up).
          if (classDetails.startsAt && classDetails.endsAt) {
            const plannedMs =
              new Date(classDetails.endsAt).getTime() - new Date(classDetails.startsAt).getTime();
            if (classDetails.liveSession?.startedAt && plannedMs > 0) {
              setEndsAt(
                new Date(
                  new Date(classDetails.liveSession.startedAt).getTime() + plannedMs,
                ).toISOString(),
              );
            } else {
              setEndsAt(classDetails.endsAt);
            }
          } else if (classDetails.endsAt) {
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
            setSettings(res.settings ?? null);
            if (res.topic || classDetails.topic) {
              setTopic(res.topic || classDetails.topic);
            }
          }
        }

        // Reached only when nothing above threw — clear any stale error so a
        // silent retry that finally succeeds (coach joined) drops the waiting
        // screen.
        if (mounted) {
          setError(null);
          setErrorCode(null);
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

  return { token, roomName, topic, settings, error, errorCode, isLoading, classStatus, startedAt, endsAt, retry };
}
