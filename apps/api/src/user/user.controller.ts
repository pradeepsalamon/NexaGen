import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import { API_ROUTES, updateExtraRolesRequestSchema } from "@nexa-chess/types";
import type { PaginatedQuery, UpdateExtraRolesRequest } from "@nexa-chess/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { RosterImportService } from "./roster-import.service";
import { UserService } from "./user.service";
import { CreateUserDto, UpdateUserDto } from "./dto/user.dto";

@Controller()
export class UserController {
  constructor(
    private readonly rosterImport: RosterImportService,
    private readonly userService: UserService
  ) { }

  /** Roster import: checks every row and creates nothing (docs/ROSTER_IMPORT.md). */
  @Post(API_ROUTES.users.importPreview)
  @HttpCode(HttpStatus.OK)
  previewImport(@Body() body: unknown, @Req() request: Request) {
    return this.rosterImport.preview(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.users.import)
  import(@Body() body: unknown, @Req() request: Request) {
    return this.rosterImport.import(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.users.invite())
  @HttpCode(HttpStatus.OK)
  resendInvite(@Param("id") id: string, @Req() request: Request) {
    return this.rosterImport.resendInvite(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.users.list)
  list(
    @Query() query: PaginatedQuery & { status?: string },
    @Req() request: Request
  ) {
    return this.userService.list(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.users.get())
  getById(@Param("id") id: string, @Req() request: Request) {
    return this.userService.getById(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.users.create)
  create(@Body() body: CreateUserDto, @Req() request: Request) {
    return this.userService.create(this.getAccessToken(request), body);
  }

  @Patch(API_ROUTES.users.update())
  update(
    @Body() body: UpdateUserDto,
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.userService.update(this.getAccessToken(request), id, body);
  }

  @Patch(API_ROUTES.users.archive())
  archive(@Param("id") id: string, @Req() request: Request) {
    return this.userService.archive(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.users.restore())
  restore(@Param("id") id: string, @Req() request: Request) {
    return this.userService.restore(this.getAccessToken(request), id);
  }

  /** "Can also teach": a super admin sets an admin account's extra roles (docs/MULTI_ROLE_ACCOUNTS.md). */
  @Put(API_ROUTES.users.extraRoles())
  setExtraRoles(
    @Body(new ZodBodyPipe(updateExtraRolesRequestSchema)) body: UpdateExtraRolesRequest,
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.userService.setExtraRoles(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.users.delete())
  delete(@Param("id") id: string, @Req() request: Request) {
    return this.userService.delete(this.getAccessToken(request), id);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
