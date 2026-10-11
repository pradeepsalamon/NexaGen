import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getStudentClassDetail } from "../api/studentClassApi";

/**
 * One class for the signed-in student. Polls while the class is waiting to
 * start or live, so Join appears when the coach starts and the recording
 * action once it ends — without a reload.
 */
export function useStudentClassDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.studentClasses.detail(id),
    queryFn: () => getStudentClassDetail(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.class.status;
      return status === "SCHEDULED" || status === "LIVE" || status === "IN_PROGRESS"
        ? 20_000
        : false;
    },
    // A "not found" is usually an answer, not a blip — fail fast to the error state.
    retry: 1
  });
}
