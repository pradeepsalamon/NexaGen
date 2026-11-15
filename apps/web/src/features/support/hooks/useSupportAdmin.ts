import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SupportMessagePage,
  SupportNoteRequest,
  SupportReplyRequest,
  SupportSavedReplyRequest,
  SupportTicketListQuery,
  SupportUnansweredListQuery,
  UpdateSupportSettingsRequest,
  UpdateSupportTicketRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  addSupportNote,
  createSupportSavedReply,
  deleteSupportSavedReply,
  dismissSupportUnanswered,
  getSupportUnanswered,
  getSupportSavedReplies,
  updateSupportSavedReply,
  getSupportAgents,
  getSupportCounts,
  getSupportMessages,
  getSupportSettings,
  getSupportTicket,
  getSupportTickets,
  replyToSupportTicket,
  returnSupportTicketToBot,
  takeOverSupportTicket,
  updateSupportSettings,
  updateSupportTicket
} from "../api/supportAdminApi";

/** New WhatsApp messages arrive without a push, so open screens poll (like /messages). */
const LIST_POLL_MS = 30_000;
const THREAD_POLL_MS = 8_000;

export function useSupportTicketsQuery(params: SupportTicketListQuery) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => getSupportTickets(params),
    queryKey: queryKeys.support.list(params),
    refetchInterval: LIST_POLL_MS
  });
}

export function useSupportCountsQuery() {
  return useQuery({ queryFn: getSupportCounts, queryKey: queryKeys.support.counts, refetchInterval: LIST_POLL_MS });
}

export function useSupportAgentsQuery() {
  return useQuery({ queryFn: getSupportAgents, queryKey: queryKeys.support.agents, staleTime: 5 * 60_000 });
}

export function useSupportTicketQuery(id: string) {
  return useQuery({ queryFn: () => getSupportTicket(id), queryKey: queryKeys.support.detail(id), refetchInterval: THREAD_POLL_MS });
}

/** The transcript, newest page first; the thread shows it oldest at the top. */
export function useSupportMessagesQuery(id: string) {
  return useInfiniteQuery({
    getNextPageParam: (last: SupportMessagePage) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getSupportMessages(id, pageParam),
    queryKey: queryKeys.support.messages(id),
    refetchInterval: THREAD_POLL_MS
  });
}

/** Every change to one ticket refreshes the ticket, its thread and the lists. */
function useTicketMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  messages: { success?: string; error: string }
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onError: (error: Error) => toast.error({ message: error.message, title: messages.error }),
    onSuccess: async () => {
      if (messages.success) toast.success({ title: messages.success });
      await queryClient.invalidateQueries({ queryKey: queryKeys.support.all });
    }
  });
}

export function useReplyToSupportTicket(id: string) {
  return useTicketMutation((body: SupportReplyRequest) => replyToSupportTicket(id, body), {
    error: "Reply not sent"
  });
}

export function useAddSupportNote(id: string) {
  return useTicketMutation((body: SupportNoteRequest) => addSupportNote(id, body), {
    error: "Note not saved",
    success: "Note added"
  });
}

export function useUpdateSupportTicket(id: string) {
  return useTicketMutation((body: UpdateSupportTicketRequest) => updateSupportTicket(id, body), {
    error: "Ticket not updated",
    success: "Ticket updated"
  });
}

export function useTakeOverSupportTicket(id: string) {
  return useTicketMutation(() => takeOverSupportTicket(id), {
    error: "Could not take over",
    success: "You're answering this conversation; the bot stays quiet"
  });
}

export function useReturnSupportTicketToBot(id: string) {
  return useTicketMutation(() => returnSupportTicketToBot(id), {
    error: "Could not hand back to the bot",
    success: "The bot answers this customer again"
  });
}

// ── Saved answers ──

export function useSupportSavedRepliesQuery() {
  return useQuery({ queryFn: getSupportSavedReplies, queryKey: queryKeys.support.savedReplies, staleTime: 60_000 });
}

function useSavedReplyMutation<TArgs>(mutationFn: (args: TArgs) => Promise<unknown>, messages: { success: string; error: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onError: (error: Error) => toast.error({ message: error.message, title: messages.error }),
    onSuccess: async () => {
      toast.success({ title: messages.success });
      await queryClient.invalidateQueries({ queryKey: queryKeys.support.savedReplies });
    }
  });
}

export function useSaveSupportSavedReply() {
  return useSavedReplyMutation(
    ({ body, id }: { body: SupportSavedReplyRequest; id?: string }) =>
      id ? updateSupportSavedReply(id, body) : createSupportSavedReply(body),
    { error: "Answer not saved", success: "Answer saved" }
  );
}

export function useDeleteSupportSavedReply() {
  return useSavedReplyMutation((id: string) => deleteSupportSavedReply(id), {
    error: "Answer not deleted",
    success: "Answer deleted"
  });
}

// ── Questions the bot couldn't answer ──

export function useSupportUnansweredQuery(params: SupportUnansweredListQuery) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => getSupportUnanswered(params),
    queryKey: queryKeys.support.unanswered(params),
    refetchInterval: LIST_POLL_MS
  });
}

/** `quiet`: no toast (used after writing an answer for the question, which has its own). */
export function useDismissSupportUnanswered() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id }: { id: string; quiet?: boolean }) => dismissSupportUnanswered(id),
    onError: (error: Error) => toast.error({ message: error.message, title: "Question not dismissed" }),
    onSuccess: async (_data, { quiet }) => {
      if (!quiet) toast.success({ title: "Question dismissed" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.support.unansweredAll });
    }
  });
}

// ── Bot settings ──

export function useSupportSettingsQuery() {
  return useQuery({ queryFn: getSupportSettings, queryKey: queryKeys.support.settings });
}

export function useUpdateSupportSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateSupportSettingsRequest) => updateSupportSettings(body),
    onError: (error: Error) => toast.error({ message: error.message, title: "Settings not saved" }),
    onSuccess: (data) => {
      toast.success({ title: "WhatsApp bot settings saved" });
      queryClient.setQueryData(queryKeys.support.settings, data);
    }
  });
}
