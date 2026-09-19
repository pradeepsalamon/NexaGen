import {
  API_ROUTES,
  type ChessAppearanceAdminResponse,
  type ChessAppearanceCatalogResponse,
  type ChessAppearanceResponse,
  type UpdateChessAppearanceAdminRequest,
  type UpdateChessAppearanceRequest,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getResolvedChessAppearance(): Promise<ChessAppearanceResponse> {
  return apiFetch(API_ROUTES.chessAppearance.get);
}

export function getChessAppearanceCatalog(): Promise<ChessAppearanceCatalogResponse> {
  return apiFetch(API_ROUTES.chessAppearance.catalog);
}

export function updateMyChessAppearance(
  body: UpdateChessAppearanceRequest,
): Promise<ChessAppearanceResponse> {
  return apiFetch(API_ROUTES.chessAppearance.me, { method: "PUT", body });
}

export function resetMyChessAppearance(): Promise<ChessAppearanceResponse> {
  return apiFetch(API_ROUTES.chessAppearance.me, { method: "DELETE" });
}

export function getChessAppearanceAdmin(): Promise<ChessAppearanceAdminResponse> {
  return apiFetch(API_ROUTES.chessAppearance.admin);
}

export function updateChessAppearanceAdmin(
  body: UpdateChessAppearanceAdminRequest,
): Promise<ChessAppearanceAdminResponse> {
  return apiFetch(API_ROUTES.chessAppearance.admin, { method: "PUT", body });
}

export function resetChessAppearanceAdmin(): Promise<ChessAppearanceAdminResponse> {
  return apiFetch(API_ROUTES.chessAppearance.adminReset, { method: "POST" });
}
