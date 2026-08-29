import { API_ROUTES } from "@nexa-chess/types";
import type {
  AssignmentDeploymentDetailResponse,
  AssignmentDeploymentListResponse,
  AssignmentLibraryResponse,
  AssignmentResponse,
  CreateAssignmentRequest,
  DeployAssignmentRequest,
  StudentAssignmentDetailResponse,
  StudentAssignmentListResponse,
  UpdateAssignmentRequest,
  UpdateAssignmentStatusRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// ── Library (admin + coach) ──

export function getAssignmentLibrary(): Promise<AssignmentLibraryResponse> {
  return apiFetch(API_ROUTES.assignments.library);
}

export function createAssignment(
  data: CreateAssignmentRequest
): Promise<AssignmentResponse> {
  return apiFetch(API_ROUTES.assignments.create, { method: "POST", body: data });
}

export function updateAssignment(
  id: string,
  data: UpdateAssignmentRequest
): Promise<AssignmentResponse> {
  return apiFetch(API_ROUTES.assignments.update(id), { method: "PATCH", body: data });
}

export function deleteAssignment(id: string): Promise<{ success: true }> {
  return apiFetch(API_ROUTES.assignments.delete(id), { method: "DELETE" });
}

// ── Deployments (coach) ──

export function getAssignmentDeployments(): Promise<AssignmentDeploymentListResponse> {
  return apiFetch(API_ROUTES.assignments.deployments);
}

export function getAssignmentDeployment(
  id: string
): Promise<AssignmentDeploymentDetailResponse> {
  return apiFetch(API_ROUTES.assignments.deployment(id));
}

export function deployAssignment(
  data: DeployAssignmentRequest
): Promise<AssignmentDeploymentListResponse> {
  return apiFetch(API_ROUTES.assignments.deploy, { method: "POST", body: data });
}

export function undeployAssignment(id: string): Promise<{ success: true }> {
  return apiFetch(API_ROUTES.assignments.undeploy(id), { method: "DELETE" });
}

// ── Student ──

export function getMyAssignments(): Promise<StudentAssignmentListResponse> {
  return apiFetch(API_ROUTES.assignments.mine);
}

export function getMyAssignment(id: string): Promise<StudentAssignmentDetailResponse> {
  return apiFetch(API_ROUTES.assignments.mineGet(id));
}

export function updateMyAssignmentStatus(
  id: string,
  data: UpdateAssignmentStatusRequest
): Promise<StudentAssignmentDetailResponse> {
  return apiFetch(API_ROUTES.assignments.updateStatus(id), { method: "PATCH", body: data });
}
