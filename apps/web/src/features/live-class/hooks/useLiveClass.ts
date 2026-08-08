import { useState, useEffect } from "react";
import { getLiveClassToken, getLiveClass } from "../api/live-class";

export function useLiveClass(roomId: string, shouldFetch: boolean = true, clientId?: string) {
  const [token, setToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [classStatus, setClassStatus] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchToken() {
      try {
        setIsLoading(true);
        setError(null);

        const classDetails = await getLiveClass(roomId);
        if (mounted) {
          setClassStatus(classDetails.status);
          if (classDetails.topic) {
            setTopic(classDetails.topic);
          }
        }

        if (classDetails.status === "COMPLETED" || classDetails.status === "CANCELLED") {
          throw new Error("Class has ended");
        }

        if (classDetails.status === "SCHEDULED") {
          throw new Error("Class has not been started yet");
        }

        if (shouldFetch) {
          const res = await getLiveClassToken(roomId, clientId);

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
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    if (roomId) {
      fetchToken();
    }

    return () => {
      mounted = false;
    };
  }, [roomId, shouldFetch, clientId]);

  return { token, roomName, topic, error, isLoading, classStatus };
}
