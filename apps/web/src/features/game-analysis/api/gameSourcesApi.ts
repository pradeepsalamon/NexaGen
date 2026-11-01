import { API_ROUTES } from "@nexa-chess/types";
import type {
  ExternalChessAccountDto,
  GameAutoSyncPolicy,
  GameAutoSyncRule,
  GameSourcesOverview,
  ImportPgnRequest,
  ImportPgnResponse,
  LinkExternalAccountRequest,
  StudentGameSources,
  SyncExternalAccountResponse,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getGameSources() {
  return apiFetch<GameSourcesOverview>(API_ROUTES.gameSources.overview);
}

export function importPgn(body: ImportPgnRequest) {
  return apiFetch<ImportPgnResponse>(API_ROUTES.games.importPgn, { body, method: "POST" });
}

export function linkAccount(body: LinkExternalAccountRequest) {
  return apiFetch<ExternalChessAccountDto>(API_ROUTES.gameSources.accounts, { body, method: "POST" });
}

export function verifyAccount(id: string) {
  return apiFetch<ExternalChessAccountDto>(API_ROUTES.gameSources.verify(id), { method: "POST" });
}

export function syncAccount(id: string, analyse: boolean) {
  return apiFetch<SyncExternalAccountResponse>(API_ROUTES.gameSources.sync(id), { body: { analyse }, method: "POST" });
}

export function setAccountAutoSync(id: string, autoSync: boolean) {
  return apiFetch<ExternalChessAccountDto>(API_ROUTES.gameSources.account(id), { body: { autoSync }, method: "PATCH" });
}

export function getStudentGameSources(studentId: string) {
  return apiFetch<StudentGameSources>(API_ROUTES.gameSources.student(studentId));
}

export function setStudentAutoSyncRule(studentId: string, rule: GameAutoSyncRule | null) {
  return apiFetch<StudentGameSources>(API_ROUTES.gameSources.student(studentId), { body: { rule }, method: "PUT" });
}

export function setAutoSyncPolicy(policy: GameAutoSyncPolicy) {
  return apiFetch<{ policy: GameAutoSyncPolicy }>(API_ROUTES.gameSources.autoSyncPolicy, { body: { policy }, method: "PUT" });
}

export function unlinkAccount(id: string, deleteGames: boolean) {
  return apiFetch<{ id: string; deletedGames: number }>(API_ROUTES.gameSources.account(id), {
    method: "DELETE",
    params: deleteGames ? { deleteGames: "true" } : undefined,
  });
}
