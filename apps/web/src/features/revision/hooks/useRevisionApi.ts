import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getRevisionReport, getRevisionSession, getRevisionSummary } from "../api/revisionApi";

export function useRevisionSummary() {
  return useQuery({ queryFn: getRevisionSummary, queryKey: queryKeys.revision.summary });
}

export function useRevisionSession() {
  return useQuery({ queryFn: getRevisionSession, queryKey: queryKeys.revision.session });
}

/** `studentId` null = the signed-in student. */
export function useRevisionReport(studentId: string | null) {
  return useQuery({
    queryFn: () => getRevisionReport(studentId),
    queryKey: queryKeys.revision.report(studentId ?? "me")
  });
}
