import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  KnowledgeAdminListQuery,
  KnowledgeHelpQuery,
  KnowledgePreviewQuery,
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import * as api from "../api/knowledgeApi";

// ── Help centre ──

export function useHelp(query: KnowledgeHelpQuery) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => api.getHelp(query),
    queryKey: queryKeys.knowledge.help(query),
    staleTime: 30_000,
  });
}

export function useHelpArticle(slug: string) {
  return useQuery({
    queryFn: () => api.getHelpArticle(slug),
    queryKey: queryKeys.knowledge.article(slug),
    retry: false,
  });
}

export function useHelpFeedback(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, helpful }: { id: string; helpful: boolean }) => api.sendHelpFeedback(id, helpful),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.article(slug) }),
  });
}

// ── Coach ──

export function useMySuggestions(enabled = true) {
  return useQuery({ enabled, queryFn: api.getMySuggestions, queryKey: queryKeys.knowledge.suggestions });
}

export function useCoachTrends(enabled = true) {
  return useQuery({ enabled, queryFn: api.getCoachTrends, queryKey: queryKeys.knowledge.trends, staleTime: 60_000 });
}

// ── Admin ──

export function useKnowledgeArticles(query: Partial<KnowledgeAdminListQuery>) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => api.listKnowledgeArticles(query),
    queryKey: queryKeys.knowledge.admin.list(query),
  });
}

export function useKnowledgeArticle(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryFn: () => api.getKnowledgeArticle(id as string),
    queryKey: queryKeys.knowledge.admin.detail(id ?? ""),
  });
}

export function useKnowledgeDiff(id: string, from: string | null, to: string | null) {
  return useQuery({
    enabled: !!from && !!to && from !== to,
    queryFn: () => api.getKnowledgeDiff(id, from as string, to as string),
    queryKey: queryKeys.knowledge.admin.diff(id, from ?? "", to ?? ""),
  });
}

export function useKnowledgeSubmissions() {
  return useQuery({ queryFn: api.getKnowledgeSubmissions, queryKey: queryKeys.knowledge.admin.submissions });
}

export function useKnowledgeCategories() {
  return useQuery({ queryFn: api.getKnowledgeCategories, queryKey: queryKeys.knowledge.admin.categories });
}

export function useKnowledgeInsights(enabled = true) {
  return useQuery({ enabled, queryFn: api.getKnowledgeInsights, queryKey: queryKeys.knowledge.admin.insights });
}

export function useHelpPreview(query: KnowledgePreviewQuery) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => api.previewHelp(query),
    queryKey: queryKeys.knowledge.admin.preview(query),
  });
}

export function useAssistantTools(enabled: boolean) {
  return useQuery({ enabled, queryFn: api.listAssistantTools, queryKey: queryKeys.assistantTools });
}

/** Every knowledge write refreshes everything knowledge (lists, detail, help, insights). */
export function useInvalidateKnowledge() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.all });
}
