import { API_ROUTES } from "@nexa-chess/types";
import type {
  AssignmentAttemptHistoryResponse,
  AssignmentDeploymentDetailResponse,
  AssignmentDeploymentListResponse,
  AssignmentEvaluationResult,
  AssignmentLibraryResponse,
  AssignmentResponse,
  AttemptProgressResponse,
  CreateAssignmentRequest,
  DeployAssignmentRequest,
  RequestEngineMoveRequest,
  RequestEngineMoveResponse,
  SaveAttemptProgressRequest,
  SolveLineHint,
  SolveLineHintRequest,
  StartAttemptResponse,
  StudentAssignmentDetailResponse,
  StudentAssignmentListResponse,
  SubmitAttemptRequest,
  UpdateAssignmentRequest,
  UpdateAssignmentStatusRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// ── Library (admin + coach) ──

export function getAssignmentLibrary(): Promise<AssignmentLibraryResponse> {
  return apiFetch(API_ROUTES.assignments.library);
}

export function getAssignmentLibraryItem(id: string): Promise<AssignmentResponse> {
  return apiFetch(API_ROUTES.assignments.get(id));
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

// ── Attempts (evaluated activities) ──

export function startAttempt(assignmentId: string): Promise<{ attempt: StartAttemptResponse }> {
  return apiFetch(API_ROUTES.assignments.attempts(assignmentId), { method: "POST" });
}

export function getAttemptHistory(assignmentId: string): Promise<AssignmentAttemptHistoryResponse> {
  return apiFetch(API_ROUTES.assignments.attempts(assignmentId));
}

export function saveAttemptProgress(
  assignmentId: string,
  attemptId: string,
  data: SaveAttemptProgressRequest
): Promise<AttemptProgressResponse> {
  return apiFetch(API_ROUTES.assignments.attempt(assignmentId, attemptId), {
    method: "PATCH",
    body: data
  });
}

export function submitAttempt(
  assignmentId: string,
  attemptId: string,
  data: SubmitAttemptRequest
): Promise<AssignmentEvaluationResult> {
  return apiFetch(API_ROUTES.assignments.submitAttempt(assignmentId, attemptId), {
    method: "POST",
    body: data
  });
}

export function requestEngineMove(
  assignmentId: string,
  attemptId: string,
  data: RequestEngineMoveRequest
): Promise<RequestEngineMoveResponse> {
  return apiFetch(API_ROUTES.assignments.engineMove(assignmentId, attemptId), {
    method: "POST",
    body: data
  });
}

export function getSolveLineHint(
  assignmentId: string,
  attemptId: string,
  data: SolveLineHintRequest
): Promise<SolveLineHint> {
  return apiFetch(API_ROUTES.assignments.hint(assignmentId, attemptId), {
    method: "POST",
    body: data
  });
}
