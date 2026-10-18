import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { ListParams } from "@/lib/pagination";
import { listUsers } from "../api/userApi";

export function useUsersQuery(params: ListParams = {}) {
  return useQuery({
    queryFn: () => listUsers(params),
    queryKey: queryKeys.users.list(params),
    placeholderData: keepPreviousData
  });
}
