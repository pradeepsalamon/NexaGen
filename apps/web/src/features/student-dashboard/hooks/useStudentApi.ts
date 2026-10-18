import { useQuery } from "@tanstack/react-query";
import { getStudentDashboard } from "../api/studentApi";

export const STUDENT_KEYS = {
  dashboard: ["student-dashboard"] as const,
};

export function useStudentDashboard() {
  return useQuery({
    queryKey: STUDENT_KEYS.dashboard,
    queryFn: getStudentDashboard,
    // Poll faster while a class is live so the participant count stays fresh
    // and a class that just started shows up without a reload.
    refetchInterval: (query) => (query.state.data?.liveClass ? 20_000 : 60_000),
  });
}
