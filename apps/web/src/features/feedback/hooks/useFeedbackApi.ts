import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FeedbackFormDto,
  FeedbackResponseListQuery,
  PendingFeedbackQuery,
  SkipFeedbackRequest,
  SubmitFeedbackRequest,
  UpsertFeedbackFormRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  createFeedbackForm,
  getCoachRatings,
  getMyFeedback,
  getPendingFeedback,
  listFeedbackForms,
  listFeedbackResponses,
  skipFeedback,
  submitFeedback,
  updateFeedbackForm
} from "../api/feedbackApi";
import { usePlanFeature } from "@/features/subscription/hooks/useSubscription";

// ── Student ──

const EMPTY_RETRY_MS = 5_000;
const EMPTY_RETRY_LIMIT = 6;

export function usePendingFeedbackQuery(
  query: PendingFeedbackQuery = {},
  enabled = true,
  { retryWhileEmpty = false }: { retryWhileEmpty?: boolean } = {}
) {
  // Mounted on dashboards and at class end: wait until the plan is known to include feedback.
  const planHasFeedback = usePlanFeature("coachFeedback") === true;
  return useQuery({
    enabled: enabled && planHasFeedback,
    refetchInterval: (q) =>
      retryWhileEmpty &&
      q.state.data?.items.length === 0 &&
      q.state.dataUpdateCount <= EMPTY_RETRY_LIMIT
        ? EMPTY_RETRY_MS
        : false,
    queryFn: () => getPendingFeedback(query),
    queryKey: queryKeys.feedback.pending({ ...query }),
    // A stale "pending" item would just 404 on submit; refresh on focus is enough.
    staleTime: 60_000
  });
}

export function useSubmitFeedbackMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: SubmitFeedbackRequest) => submitFeedback(body),
    onError: (error: Error) => {
      toast.error({ message: error.message, title: "Couldn't send feedback" });
    },
    onSuccess: () => {
      toast.success({ title: "Thanks for your feedback!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all });
    }
  });
}

export function useSkipFeedbackMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: SkipFeedbackRequest) => skipFeedback(body),
    onError: (error: Error) => {
      toast.error({ message: error.message, title: "Couldn't skip feedback" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all });
    }
  });
}

// ── Coach ──

export function useMyFeedbackQuery() {
  return useQuery({ queryFn: getMyFeedback, queryKey: queryKeys.feedback.mine });
}

// ── Admin ──

export function useFeedbackFormsQuery() {
  return useQuery({ queryFn: listFeedbackForms, queryKey: queryKeys.feedback.forms });
}

export function useSaveFeedbackFormMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ body, id }: { id?: string; body: UpsertFeedbackFormRequest }) =>
      id ? updateFeedbackForm(id, body) : createFeedbackForm(body),
    onError: (error: Error) => {
      toast.error({ message: error.message, title: "Couldn't save the form" });
    },
    onSuccess: (_result, { id }) => {
      toast.success({ title: id ? "Feedback form updated" : "Feedback form created" });
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all });
    }
  });
}

/** Flip a form on/off without opening the editor. */
export function useToggleFeedbackFormMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (form: FeedbackFormDto) =>
      updateFeedbackForm(form.id, {
        allowSkip: form.allowSkip,
        batchIds: form.batchIds,
        classInterval: form.classInterval,
        description: form.description,
        endsAt: form.endsAt,
        expiresAfterDays: form.expiresAfterDays,
        intervalDays: form.intervalDays,
        isActive: !form.isActive,
        placements: form.placements,
        questions: form.questions,
        showToCoach: form.showToCoach,
        startsAt: form.startsAt,
        title: form.title,
        trigger: form.trigger
      }),
    onError: (error: Error) => {
      toast.error({ message: error.message, title: "Couldn't update the form" });
    },
    onSuccess: ({ form }) => {
      toast.success({ title: form.isActive ? "Form activated" : "Form deactivated" });
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all });
    }
  });
}

export function useFeedbackResponsesQuery(query: FeedbackResponseListQuery) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listFeedbackResponses(query),
    queryKey: queryKeys.feedback.responses({ ...query })
  });
}

export function useCoachRatingsQuery() {
  return useQuery({ queryFn: getCoachRatings, queryKey: queryKeys.feedback.coachRatings });
}
