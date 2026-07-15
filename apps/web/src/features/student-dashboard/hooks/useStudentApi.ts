import { useQuery } from "@tanstack/react-query";
import { getStudentDashboard } from "../api/studentApi";

export const STUDENT_KEYS = {
  dashboard: ["student-dashboard"] as const,
};

export function useStudentDashboard() {
  return useQuery({
    queryKey: STUDENT_KEYS.dashboard,
    queryFn: getStudentDashboard,
  });
}
