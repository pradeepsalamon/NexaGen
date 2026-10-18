import { API_ROUTES } from "@nexa-chess/types";
import type {
  GameLibraryDetail,
  GameLibraryFilterOptions,
  GameLibraryListResponse,
  GameLibraryQuery,
  ImportGameRequest,
  SaveGameAnalysisRequest,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export type GameLibraryFilters = Partial<Omit<GameLibraryQuery, "page" | "pageSize">> & {
  page?: number;
  pageSize?: number;
};

export function listGames(filters: GameLibraryFilters) {
  // Drop empty values so the API's zod query schema sees only real filters.
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  return apiFetch<GameLibraryListResponse>(API_ROUTES.games.list, { params });
}

export function getGameFilterOptions() {
  return apiFetch<GameLibraryFilterOptions>(API_ROUTES.games.filterOptions);
}

export function getGame(id: string) {
  return apiFetch<GameLibraryDetail>(API_ROUTES.games.get(id));
}

export function importGame(body: ImportGameRequest) {
  return apiFetch<GameLibraryDetail>(API_ROUTES.games.import, { body, method: "POST" });
}

export function saveGameAnalysis(id: string, body: SaveGameAnalysisRequest) {
  return apiFetch<GameLibraryDetail>(API_ROUTES.games.saveAnalysis(id), { body, method: "PUT" });
}

export function deleteGame(id: string) {
  return apiFetch<{ id: string }>(API_ROUTES.games.delete(id), { method: "DELETE" });
}
