import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getMyProgress, getStudentProgress } from "../api/progressApi";

export function useMyProgress() {
  return useQuery({ queryKey: queryKeys.progress.mine, queryFn: getMyProgress });
}

export function useStudentProgress(studentId: string | null) {
  return useQuery({
    enabled: !!studentId,
    queryKey: queryKeys.progress.student(studentId ?? ""),
    queryFn: () => getStudentProgress(studentId as string)
  });
}
