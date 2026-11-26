import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getWeakSpots } from "../api/weakSpotsApi";

/** A student's weak spots and strengths (computed on the server, never stored). */
export function useWeakSpots(studentId: string) {
  return useQuery({ queryKey: queryKeys.playReview.weakSpots(studentId), queryFn: () => getWeakSpots(studentId) });
}
