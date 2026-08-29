import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  createAssignmentRequestSchema,
  deployAssignmentRequestSchema,
  updateAssignmentRequestSchema,
  updateAssignmentStatusRequestSchema,
  type CreateAssignmentRequest,
  type DeployAssignmentRequest,
  type UpdateAssignmentRequest,
  type UpdateAssignmentStatusRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { AssignmentService } from "./assignment.service";

@Controller()
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  // ── Library (admin: shared items; coach: shared + own) ──

  @Get(API_ROUTES.assignments.library)
  listLibrary(@Req() request: Request) {
    return this.assignmentService.listLibrary(this.getAccessToken(request));
  }

  @Post(API_ROUTES.assignments.create)
  createLibraryItem(
    @Body(new ZodBodyPipe(createAssignmentRequestSchema)) body: CreateAssignmentRequest,
    @Req() request: Request
  ) {
    return this.assignmentService.create(this.getAccessToken(request), body);
  }

  // ── Deployments to batches (coach) ──

  @Get(API_ROUTES.assignments.deployments)
  listDeployments(@Req() request: Request) {
    return this.assignmentService.listDeployments(this.getAccessToken(request));
  }

  @Post(API_ROUTES.assignments.deploy)
  deploy(
    @Body(new ZodBodyPipe(deployAssignmentRequestSchema)) body: DeployAssignmentRequest,
    @Req() request: Request
  ) {
    return this.assignmentService.deploy(this.getAccessToken(request), body);
  }

  // ── Student's own assignments ──

  @Get(API_ROUTES.assignments.mine)
  listForStudent(@Req() request: Request) {
    return this.assignmentService.listForStudent(this.getAccessToken(request));
  }

  @Get(API_ROUTES.assignments.mineGet())
  getForStudent(@Param("id") id: string, @Req() request: Request) {
    return this.assignmentService.getForStudent(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.assignments.updateStatus())
  updateStatus(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateAssignmentStatusRequestSchema)) body: UpdateAssignmentStatusRequest,
    @Req() request: Request
  ) {
    return this.assignmentService.updateStatus(this.getAccessToken(request), id, body);
  }

  // ── Deployment detail / removal (coach) ──

  @Get(API_ROUTES.assignments.deployment())
  getDeployment(@Param("id") id: string, @Req() request: Request) {
    return this.assignmentService.getDeployment(this.getAccessToken(request), id);
  }

  @Delete(API_ROUTES.assignments.undeploy())
  undeploy(@Param("id") id: string, @Req() request: Request) {
    return this.assignmentService.undeploy(this.getAccessToken(request), id);
  }

  // ── Library item detail / edit / delete ──

  @Get(API_ROUTES.assignments.get())
  getLibraryItem(@Param("id") id: string, @Req() request: Request) {
    return this.assignmentService.getLibraryItem(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.assignments.update())
  updateLibraryItem(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateAssignmentRequestSchema)) body: UpdateAssignmentRequest,
    @Req() request: Request
  ) {
    return this.assignmentService.update(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.assignments.delete())
  deleteLibraryItem(@Param("id") id: string, @Req() request: Request) {
    return this.assignmentService.remove(this.getAccessToken(request), id);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
