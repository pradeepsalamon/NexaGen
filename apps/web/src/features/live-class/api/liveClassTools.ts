import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type LiveClassToolKind,
  type LiveClassToolResponse,
  type LiveClassToolsResponse,
  type UpdateLiveClassToolRequest
} from "@nexa-chess/types";

export const getLiveClassTools = (classId: string): Promise<LiveClassToolsResponse> =>
  apiFetch<LiveClassToolsResponse>(API_ROUTES.liveClass.tools(classId));

export const updateLiveClassTool = <K extends LiveClassToolKind>(
  classId: string,
  tool: K,
  body: UpdateLiveClassToolRequest<K>
): Promise<LiveClassToolResponse> =>
  apiFetch<LiveClassToolResponse>(API_ROUTES.liveClass.tool(classId, tool), { method: "PUT", body });
