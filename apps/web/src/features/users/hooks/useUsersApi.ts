import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateUserRequest, UpdateUserRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import {
  archiveUser,
  createUser,
  deleteUser,
  listUsers,
  restoreUser,
  updateUser
} from "../api/userApi";

export function useUsersQuery() {
  return useQuery({
    queryFn: listUsers,
    queryKey: queryKeys.users.all
  });
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserRequest) => createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    }
  });
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserRequest }) =>
      updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    }
  });
}

export function useArchiveUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; isUndo?: boolean }) => archiveUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    }
  });
}

export function useRestoreUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; isUndo?: boolean }) => restoreUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    }
  });
}

export function useDeleteUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    }
  });
}
