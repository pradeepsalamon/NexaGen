import { API_ROUTES } from "@nexa-chess/types";
import type {
  ExternalChessAccountDto,
  GameSourcesOverview,
  ImportPgnRequest,
  ImportPgnResponse,
  LinkExternalAccountRequest,
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

export function unlinkAccount(id: string, deleteGames: boolean) {
  return apiFetch<{ id: string; deletedGames: number }>(API_ROUTES.gameSources.account(id), {
    method: "DELETE",
    params: deleteGames ? { deleteGames: "true" } : undefined,
  });
}
