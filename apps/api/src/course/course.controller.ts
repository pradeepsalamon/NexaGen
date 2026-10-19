import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  attachCourseModuleRequestSchema,
  courseListQuerySchema,
  createCourseRequestSchema,
  reorderCourseModulesRequestSchema,
  setCourseArchivedRequestSchema,
  setCoursePublishedRequestSchema,
  updateCourseModuleRequestSchema,
  updateCourseRequestSchema,
  type AttachCourseModuleRequest,
  type CourseListQuery,
  type CreateCourseRequest,
  type ReorderCourseModulesRequest,
  type SetCourseArchivedRequest,
  type SetCoursePublishedRequest,
  type UpdateCourseModuleRequest,
  type UpdateCourseRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { CourseProgressService } from "./course-progress.service";
import { CourseService } from "./course.service";
import { RequireFeature } from "../platform/require-feature.decorator";

@RequireFeature("courses")
@Controller()
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly progressService: CourseProgressService
  ) {}

  // ── Student (registered before the dynamic admin :id routes below) ──

  @Get(API_ROUTES.courses.mine)
  listMine(@Req() request: Request) {
    return this.progressService.listForStudent(this.token(request));
  }

  @Get(API_ROUTES.courses.mineGet())
  getMine(@Param("id") id: string, @Req() request: Request) {
    return this.progressService.getForStudent(this.token(request), id);
  }

  @Post(API_ROUTES.courses.completeModule())
  completeModule(
    @Param("id") id: string,
    @Param("moduleId") moduleId: string,
    @Req() request: Request
  ) {
    return this.progressService.completeModule(this.token(request), id, moduleId);
  }

  // ── Admin ──

  @Get(API_ROUTES.courses.list)
  list(
    @Query(new ZodBodyPipe(courseListQuerySchema)) query: CourseListQuery,
    @Req() request: Request
  ) {
    return this.courseService.list(this.token(request), query);
  }

  @Post(API_ROUTES.courses.create)
  create(
    @Body(new ZodBodyPipe(createCourseRequestSchema)) body: CreateCourseRequest,
    @Req() request: Request
  ) {
    return this.courseService.create(this.token(request), body);
  }

  @Post(API_ROUTES.courses.modules())
  attachModule(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(attachCourseModuleRequestSchema)) body: AttachCourseModuleRequest,
    @Req() request: Request
  ) {
    return this.courseService.attachModule(this.token(request), id, body);
  }

  @Patch(API_ROUTES.courses.reorderModules())
  reorderModules(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(reorderCourseModulesRequestSchema)) body: ReorderCourseModulesRequest,
    @Req() request: Request
  ) {
    return this.courseService.reorderModules(this.token(request), id, body);
  }

  @Patch(API_ROUTES.courses.module())
  updateModule(
    @Param("id") id: string,
    @Param("moduleId") moduleId: string,
    @Body(new ZodBodyPipe(updateCourseModuleRequestSchema)) body: UpdateCourseModuleRequest,
    @Req() request: Request
  ) {
    return this.courseService.updateModule(this.token(request), id, moduleId, body);
  }

  @Delete(API_ROUTES.courses.module())
  removeModule(
    @Param("id") id: string,
    @Param("moduleId") moduleId: string,
    @Req() request: Request
  ) {
    return this.courseService.removeModule(this.token(request), id, moduleId);
  }

  @Post(API_ROUTES.courses.publish())
  publish(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(setCoursePublishedRequestSchema)) body: SetCoursePublishedRequest,
    @Req() request: Request
  ) {
    return this.courseService.setPublished(this.token(request), id, body);
  }

  @Post(API_ROUTES.courses.archive())
  archive(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(setCourseArchivedRequestSchema)) body: SetCourseArchivedRequest,
    @Req() request: Request
  ) {
    return this.courseService.setArchived(this.token(request), id, body);
  }

  @Get(API_ROUTES.courses.get())
  get(@Param("id") id: string, @Req() request: Request) {
    return this.courseService.get(this.token(request), id);
  }

  @Patch(API_ROUTES.courses.update())
  update(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateCourseRequestSchema)) body: UpdateCourseRequest,
    @Req() request: Request
  ) {
    return this.courseService.update(this.token(request), id, body);
  }

  @Delete(API_ROUTES.courses.delete())
  remove(@Param("id") id: string, @Req() request: Request) {
    return this.courseService.remove(this.token(request), id);
  }

  private token(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
