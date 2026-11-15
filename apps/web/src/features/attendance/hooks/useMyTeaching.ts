import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getMyTeaching } from "../api/attendanceApi";

/** The coach's own teaching attendance (`/coach/attendance`). */
export function useMyTeaching() {
  return useQuery({
    queryKey: queryKeys.attendance.myTeaching,
    queryFn: getMyTeaching
  });
}
