import { API_ROUTES } from "@nexa-chess/types";
import type {
  AssistantToolListResponse,
  KnowledgeAdminArticleDetail,
  KnowledgeAdminListQuery,
  KnowledgeAdminListResponse,
  KnowledgeCategoryDto,
  KnowledgeCategoryRequest,
  KnowledgeCoachTrendsResponse,
  KnowledgeExportFile,
  KnowledgeHelpArticle,
  KnowledgeHelpQuery,
  KnowledgeHelpResponse,
  KnowledgeImportRequest,
  KnowledgeImportResponse,
  KnowledgeInsightsResponse,
  KnowledgePreviewQuery,
  KnowledgeSubmissionDto,
  KnowledgeSubmissionsResponse,
  KnowledgeVersionDiffResponse,
  CreateKnowledgeArticleRequest,
  PublishKnowledgeRequest,
  RejectKnowledgeRequest,
  ResolveKnowledgeQueryRequest,
  RollbackKnowledgeRequest,
  RunAssistantToolRequest,
  RunAssistantToolResponse,
  SuggestKnowledgeRequest,
  UpdateKnowledgeCategoryRequest,
  UpdateKnowledgeDraftRequest,
  UpdateKnowledgeSettingsRequest,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

const clean = <T extends object>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null));

// ── Help centre (every role) ──

export function getHelp(query: KnowledgeHelpQuery) {
  return apiFetch<KnowledgeHelpResponse>(API_ROUTES.knowledge.help, { params: clean(query) });
}

export function getHelpArticle(slug: string) {
  return apiFetch<KnowledgeHelpArticle>(API_ROUTES.knowledge.helpArticle(slug));
}

export function sendHelpFeedback(id: string, helpful: boolean) {
  return apiFetch<{ ok: true }>(API_ROUTES.knowledge.feedback(id), { body: { helpful }, method: "PUT" });
}

// ── Coach ──

export function getMySuggestions() {
  return apiFetch<KnowledgeSubmissionsResponse>(API_ROUTES.knowledge.suggestions);
}

export function suggestArticle(body: SuggestKnowledgeRequest) {
  return apiFetch<KnowledgeSubmissionDto>(API_ROUTES.knowledge.suggestions, { body, method: "POST" });
}

export function updateSuggestion(id: string, body: UpdateKnowledgeDraftRequest) {
  return apiFetch<KnowledgeSubmissionDto>(API_ROUTES.knowledge.suggestion(id), { body, method: "PATCH" });
}

export function withdrawSuggestion(id: string) {
  return apiFetch<{ ok: true }>(API_ROUTES.knowledge.suggestion(id), { method: "DELETE" });
}

export function getCoachTrends() {
  return apiFetch<KnowledgeCoachTrendsResponse>(API_ROUTES.knowledge.trends);
}

// ── Admin ──

const A = API_ROUTES.adminKnowledge;

export function listKnowledgeArticles(query: Partial<KnowledgeAdminListQuery>) {
  return apiFetch<KnowledgeAdminListResponse>(A.articles, { params: clean(query) });
}

export function createKnowledgeArticle(body: CreateKnowledgeArticleRequest) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.articles, { body, method: "POST" });
}

export function getKnowledgeArticle(id: string) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.article(id));
}

export function deleteKnowledgeArticle(id: string) {
  return apiFetch<{ ok: true }>(A.article(id), { method: "DELETE" });
}

export function saveKnowledgeDraft(id: string, body: UpdateKnowledgeDraftRequest) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.draft(id), { body, method: "PUT" });
}

export function discardKnowledgeDraft(id: string) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.draft(id), { method: "DELETE" });
}

export function updateKnowledgeSettings(id: string, body: UpdateKnowledgeSettingsRequest) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.settings(id), { body, method: "PATCH" });
}

export function publishKnowledge(id: string, body: PublishKnowledgeRequest) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.publish(id), { body, method: "POST" });
}

export function unpublishKnowledge(id: string) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.unpublish(id), { method: "POST" });
}

export function archiveKnowledge(id: string) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.archive(id), { method: "POST" });
}

export function restoreKnowledge(id: string) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.restore(id), { method: "POST" });
}

export function rollbackKnowledge(id: string, body: RollbackKnowledgeRequest) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.rollback(id), { body, method: "POST" });
}

export function rejectKnowledge(id: string, body: RejectKnowledgeRequest) {
  return apiFetch<KnowledgeAdminArticleDetail>(A.reject(id), { body, method: "POST" });
}

export function getKnowledgeDiff(id: string, from: string, to: string) {
  return apiFetch<KnowledgeVersionDiffResponse>(A.diff(id), { params: { from, to } });
}

export function getKnowledgeSubmissions() {
  return apiFetch<KnowledgeSubmissionsResponse>(A.submissions);
}

export function getKnowledgeCategories() {
  return apiFetch<{ categories: KnowledgeCategoryDto[] }>(A.categories);
}

export function createKnowledgeCategory(body: KnowledgeCategoryRequest) {
  return apiFetch<KnowledgeCategoryDto>(A.categories, { body, method: "POST" });
}

export function updateKnowledgeCategory(id: string, body: UpdateKnowledgeCategoryRequest) {
  return apiFetch<KnowledgeCategoryDto>(A.category(id), { body, method: "PATCH" });
}

export function deleteKnowledgeCategory(id: string) {
  return apiFetch<{ ok: true }>(A.category(id), { method: "DELETE" });
}

export function previewHelp(query: KnowledgePreviewQuery) {
  return apiFetch<KnowledgeHelpResponse>(A.preview, { params: clean(query) });
}

export function getKnowledgeInsights() {
  return apiFetch<KnowledgeInsightsResponse>(A.insights);
}

export function resolveKnowledgeQuery(body: ResolveKnowledgeQueryRequest) {
  return apiFetch<{ updated: number }>(A.resolveQuery, { body, method: "POST" });
}

export function exportKnowledge() {
  return apiFetch<KnowledgeExportFile>(A.export);
}

export function importKnowledge(body: KnowledgeImportRequest) {
  return apiFetch<KnowledgeImportResponse>(A.import, { body, method: "POST" });
}

// ── Assistant tools (super admin) ──

export function listAssistantTools() {
  return apiFetch<AssistantToolListResponse>(API_ROUTES.adminAi.tools);
}

export function runAssistantTool(body: RunAssistantToolRequest) {
  return apiFetch<RunAssistantToolResponse>(API_ROUTES.adminAi.runTool, { body, method: "POST" });
}
