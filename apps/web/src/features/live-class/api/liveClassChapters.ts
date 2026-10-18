import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type CreateLiveClassChapterRequest,
  type DeleteLiveClassChaptersRequest,
  type DeleteLiveClassChaptersResponse,
  type ImportLiveClassChaptersRequest,
  type LiveClassChaptersResponse,
  type ReorderLiveClassChaptersRequest,
  type UpdateLiveClassChapterRequest
} from "@nexa-chess/types";

export const getLiveClassChapters = (classId: string): Promise<LiveClassChaptersResponse> =>
  apiFetch<LiveClassChaptersResponse>(API_ROUTES.liveClass.chapters(classId));

export const createLiveClassChapter = (
  classId: string,
  body: CreateLiveClassChapterRequest
): Promise<LiveClassChaptersResponse> =>
  apiFetch<LiveClassChaptersResponse>(API_ROUTES.liveClass.chapters(classId), { method: "POST", body });

export const importLiveClassChapters = (
  classId: string,
  body: ImportLiveClassChaptersRequest
): Promise<LiveClassChaptersResponse> =>
  apiFetch<LiveClassChaptersResponse>(API_ROUTES.liveClass.chapterImport(classId), { method: "POST", body });

export const updateLiveClassChapter = (
  classId: string,
  chapterId: string,
  body: UpdateLiveClassChapterRequest
): Promise<LiveClassChaptersResponse> =>
  apiFetch<LiveClassChaptersResponse>(API_ROUTES.liveClass.chapter(classId, chapterId), { method: "PATCH", body });

export const reorderLiveClassChapters = (
  classId: string,
  body: ReorderLiveClassChaptersRequest
): Promise<LiveClassChaptersResponse> =>
  apiFetch<LiveClassChaptersResponse>(API_ROUTES.liveClass.chapterOrder(classId), { method: "PUT", body });

export const deleteLiveClassChapter = (classId: string, chapterId: string): Promise<LiveClassChaptersResponse> =>
  apiFetch<LiveClassChaptersResponse>(API_ROUTES.liveClass.chapter(classId, chapterId), { method: "DELETE" });

export const deleteLiveClassChapters = (
  classId: string,
  body: DeleteLiveClassChaptersRequest
): Promise<DeleteLiveClassChaptersResponse> =>
  apiFetch<DeleteLiveClassChaptersResponse>(API_ROUTES.liveClass.chapterBulkDelete(classId), { method: "POST", body });
