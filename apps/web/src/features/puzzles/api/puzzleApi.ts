import { API_ROUTES } from "@nexa-chess/types";
import type {
  BulkPuzzleActionRequest,
  BulkPuzzleActionResponse,
  CatalogAdoptRequest,
  CatalogAdoptResponse,
  CatalogListQuery,
  CatalogListResponse,
  CatalogMaterialiseResponse,
  CatalogPreviewResponse,
  CreatePuzzleRequest,
  CreatePuzzleTopicRequest,
  FolderHomeworkResponse,
  ImportPuzzlesRequest,
  ImportPuzzlesResponse,
  PuzzleAttemptHistoryResponse,
  PuzzleAttemptProgressResponse,
  PuzzleAttemptResultResponse,
  PuzzleHintRequest,
  PuzzleHintResponse,
  PuzzleListQuery,
  PuzzleListResponse,
  PuzzleResponse,
  PuzzleScoringSettingsResponse,
  PuzzleStatsResponse,
  PuzzleTopicListResponse,
  PuzzleTopicResponse,
  ReassignPuzzleTopicRequest,
  CopyPuzzleTopicRequest,
  CopyPuzzleTopicResponse,
  SavePuzzleAttemptRequest,
  SetPuzzleArchivedRequest,
  SetPuzzlePublishedRequest,
  StartPuzzleAttemptResponse,
  StudentPuzzleDetailResponse,
  StudentPuzzleListQuery,
  StudentPuzzleListResponse,
  SubmitPuzzleAttemptRequest,
  UpdatePuzzleRequest,
  UpdatePuzzleScoringSettingsRequest,
  UpdatePuzzleTopicRequest,
  ValidatePuzzleRequest,
  ValidatePuzzleResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== null) sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ── Topics ──

export function getPuzzleTopics(): Promise<PuzzleTopicListResponse> {
  return apiFetch(API_ROUTES.puzzles.topics);
}

export function createPuzzleTopic(
  data: CreatePuzzleTopicRequest
): Promise<PuzzleTopicResponse> {
  return apiFetch(API_ROUTES.puzzles.topics, { method: "POST", body: data });
}

export function updatePuzzleTopic(
  id: string,
  data: UpdatePuzzleTopicRequest
): Promise<PuzzleTopicResponse> {
  return apiFetch(API_ROUTES.puzzles.topic(id), { method: "PATCH", body: data });
}

export function archivePuzzleTopic(id: string): Promise<{ success: true }> {
  return apiFetch(API_ROUTES.puzzles.archiveTopic(id), { method: "POST" });
}

export function reassignPuzzleTopic(
  id: string,
  data: ReassignPuzzleTopicRequest
): Promise<{ success: true; moved: number }> {
  return apiFetch(API_ROUTES.puzzles.reassignTopic(id), { method: "POST", body: data });
}

export function copyPuzzleTopic(id: string, data: CopyPuzzleTopicRequest): Promise<CopyPuzzleTopicResponse> {
  return apiFetch(API_ROUTES.puzzles.copyTopic(id), { method: "POST", body: data });
}

/** Super Admin only: approve a folder for homework, academy-wide. */
export function approveFolderHomework(id: string): Promise<PuzzleTopicResponse> {
  return apiFetch(API_ROUTES.puzzles.topicHomework(id), { method: "PUT" });
}

/** Super Admin only: revoke a folder's homework approval, academy-wide. */
export function revokeFolderHomework(id: string): Promise<PuzzleTopicResponse> {
  return apiFetch(API_ROUTES.puzzles.topicHomework(id), { method: "DELETE" });
}

/** The puzzles assigning a folder would set, in order, and whether it can be assigned. */
export function getFolderHomework(id: string): Promise<FolderHomeworkResponse> {
  return apiFetch(API_ROUTES.puzzles.topicHomework(id));
}

// ── Library ──

export function getPuzzles(query: PuzzleListQuery): Promise<PuzzleListResponse> {
  return apiFetch(
    API_ROUTES.puzzles.list +
      qs({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        sort: query.sort,
        order: query.order,
        topicId: query.topicId,
        topicScope: query.topicScope,
        puzzleType: query.puzzleType,
        difficulty: query.difficulty,
        status: query.status,
        visibility: query.visibility,
        creatorId: query.creatorId,
        scope: query.scope
      })
  );
}

export function getPuzzle(id: string): Promise<PuzzleResponse> {
  return apiFetch(API_ROUTES.puzzles.get(id));
}

export function getPuzzleStats(): Promise<PuzzleStatsResponse> {
  return apiFetch(API_ROUTES.puzzles.stats);
}

export function createPuzzle(data: CreatePuzzleRequest): Promise<PuzzleResponse> {
  return apiFetch(API_ROUTES.puzzles.create, { method: "POST", body: data });
}

export function updatePuzzle(
  id: string,
  data: UpdatePuzzleRequest
): Promise<PuzzleResponse> {
  return apiFetch(API_ROUTES.puzzles.update(id), { method: "PATCH", body: data });
}

export function deletePuzzle(id: string): Promise<{ success: true }> {
  return apiFetch(API_ROUTES.puzzles.delete(id), { method: "DELETE" });
}

export function setPuzzlePublished(
  id: string,
  data: SetPuzzlePublishedRequest
): Promise<PuzzleResponse> {
  return apiFetch(API_ROUTES.puzzles.publish(id), { method: "POST", body: data });
}

export function setPuzzleArchived(
  id: string,
  data: SetPuzzleArchivedRequest
): Promise<PuzzleResponse> {
  return apiFetch(API_ROUTES.puzzles.archive(id), { method: "POST", body: data });
}

export function duplicatePuzzle(id: string): Promise<PuzzleResponse> {
  return apiFetch(API_ROUTES.puzzles.duplicate(id), { method: "POST" });
}

export function bulkPuzzleAction(
  data: BulkPuzzleActionRequest
): Promise<BulkPuzzleActionResponse> {
  return apiFetch(API_ROUTES.puzzles.bulk, { method: "POST", body: data });
}

export function importPuzzles(data: ImportPuzzlesRequest): Promise<ImportPuzzlesResponse> {
  return apiFetch(API_ROUTES.puzzles.import, { method: "POST", body: data });
}

export function validatePuzzle(
  data: ValidatePuzzleRequest
): Promise<ValidatePuzzleResponse> {
  return apiFetch(API_ROUTES.puzzles.validate, { method: "POST", body: data });
}

// ── Student ──

export function getMyPuzzles(
  query: StudentPuzzleListQuery
): Promise<StudentPuzzleListResponse> {
  return apiFetch(
    API_ROUTES.puzzles.mine +
      qs({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        topicId: query.topicId,
        topicScope: query.topicScope,
        puzzleType: query.puzzleType,
        difficulty: query.difficulty,
        solved: query.solved
      })
  );
}

export function getMyPuzzle(id: string): Promise<StudentPuzzleDetailResponse> {
  return apiFetch(API_ROUTES.puzzles.mineGet(id));
}

export function startPuzzleAttempt(
  puzzleId: string
): Promise<{ attempt: StartPuzzleAttemptResponse }> {
  return apiFetch(API_ROUTES.puzzles.attempts(puzzleId), { method: "POST" });
}

export function getPuzzleAttemptHistory(
  puzzleId: string
): Promise<PuzzleAttemptHistoryResponse> {
  return apiFetch(API_ROUTES.puzzles.attempts(puzzleId));
}

export function savePuzzleAttempt(
  puzzleId: string,
  attemptId: string,
  data: SavePuzzleAttemptRequest
): Promise<PuzzleAttemptProgressResponse> {
  return apiFetch(API_ROUTES.puzzles.attempt(puzzleId, attemptId), {
    method: "PATCH",
    body: data
  });
}

export function submitPuzzleAttempt(
  puzzleId: string,
  attemptId: string,
  data: SubmitPuzzleAttemptRequest
): Promise<PuzzleAttemptResultResponse> {
  return apiFetch(API_ROUTES.puzzles.submitAttempt(puzzleId, attemptId), {
    method: "POST",
    body: data
  });
}

export function getPuzzleHint(
  puzzleId: string,
  attemptId: string,
  data: PuzzleHintRequest
): Promise<PuzzleHintResponse> {
  return apiFetch(API_ROUTES.puzzles.hint(puzzleId, attemptId), {
    method: "POST",
    body: data
  });
}

// ── Live-class points & leaderboard defaults ──

export function getPuzzleScoringSettings(): Promise<PuzzleScoringSettingsResponse> {
  return apiFetch(API_ROUTES.puzzles.scoringSettings);
}

export function updatePuzzleScoringSettings(
  data: UpdatePuzzleScoringSettingsRequest
): Promise<PuzzleScoringSettingsResponse> {
  return apiFetch(API_ROUTES.puzzles.scoringSettings, { method: "PUT", body: data });
}

// ── Lichess catalogue (admin + coach) ──

export function getCatalogPuzzles(query: CatalogListQuery): Promise<CatalogListResponse> {
  return apiFetch(
    `${API_ROUTES.puzzles.catalog}${qs({
      ratingMin: query.ratingMin,
      ratingMax: query.ratingMax,
      themes: query.themes?.length ? query.themes.join(",") : undefined,
      themeMode: query.themeMode,
      opening: query.opening,
      includeBelowGate: query.includeBelowGate ? "true" : undefined,
      seed: query.seed,
      cursor: query.cursor,
      pageSize: query.pageSize
    })}`
  );
}

/** The one catalogue call that returns the solution line. */
export function getCatalogPreview(sourceId: string): Promise<CatalogPreviewResponse> {
  return apiFetch(API_ROUTES.puzzles.catalogPreview(sourceId));
}

/** Copy into the hidden "Lichess" folder (or find the existing copy). */
export function materialiseCatalogPuzzle(sourceId: string): Promise<CatalogMaterialiseResponse> {
  return apiFetch(API_ROUTES.puzzles.catalogMaterialise, { method: "POST", body: { sourceId } });
}

export function adoptCatalogPuzzles(data: CatalogAdoptRequest): Promise<CatalogAdoptResponse> {
  return apiFetch(API_ROUTES.puzzles.catalogAdopt, { method: "POST", body: data });
}
