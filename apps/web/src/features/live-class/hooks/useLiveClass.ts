import { useState, useEffect } from "react";
import { getLiveClassToken } from "../api/live-class";

export function useLiveClass(roomId: string, shouldFetch: boolean = true) {
  const [token, setToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchToken() {
      try {
        setIsLoading(true);
        setError(null);
        
        const res = await getLiveClassToken(roomId);
        
        if (mounted) {
          setToken(res.token);
          setRoomName(res.roomName);
          setTopic(res.topic || null);
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

    if (roomId && shouldFetch) {
      fetchToken();
    }

    return () => {
      mounted = false;
    };
  }, [roomId, shouldFetch]);

  return { token, roomName, topic, error, isLoading };
}
