import { Controller, Delete, Get, Patch, Post, Param, Body, Query, Req, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  API_ROUTES,
  addDemoInviteesRequestSchema,
  createDemoClassRequestSchema,
  updateDemoClassRequestSchema
} from '@nexa-chess/types';
import type {
  AddDemoInviteesRequest,
  CreateDemoClassRequest,
  PaginatedQuery,
  UpdateCoachStatusRequest,
  UpdateDemoClassRequest,
  UpdateStudentStatusRequest
} from '@nexa-chess/types';
import { ZodBodyPipe } from './dto/demo-class.dto';
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { getApiEnv } from '@nexa-chess/config/api';

@Controller()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private async getAdminId(request: Request): Promise<string> {
    const token = request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
    if (!token) throw new UnauthorizedException();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: getApiEnv().JWT_ACCESS_SECRET
      });
    } catch {
      throw new UnauthorizedException();
    }

    // Outside the try so this specific message reaches the client (AUDIT L10).
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new UnauthorizedException('Only Super Admins can perform this action.');
    }
    return user.id;
  }

  // Student approvals are open to ADMIN as well, unlike the super-admin-only routes.
  private async assertStaffAdmin(request: Request): Promise<void> {
    const token = request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
    if (!token) throw new UnauthorizedException();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: getApiEnv().JWT_ACCESS_SECRET
      });
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE' || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      throw new ForbiddenException('Only admins can review student registrations.');
    }
  }

  @Get(API_ROUTES.admin.pendingStudents)
  async getPendingStudents(@Req() request: Request) {
    await this.assertStaffAdmin(request);
    return this.adminService.getPendingStudents();
  }

  @Patch(API_ROUTES.admin.updateStudentStatus())
  async updateStudentStatus(
    @Param('id') id: string,
    @Body() body: UpdateStudentStatusRequest,
    @Req() request: Request
  ) {
    await this.assertStaffAdmin(request);
    return this.adminService.updateStudentStatus(id, body);
  }

  @Get(API_ROUTES.admin.pendingCoaches)
  async getPendingCoaches(@Req() request: Request) {
    await this.getAdminId(request);
    return this.adminService.getPendingCoaches();
  }

  @Patch(API_ROUTES.admin.updateCoachStatus())
  async updateCoachStatus(
    @Param('id') id: string,
    @Body() body: UpdateCoachStatusRequest,
    @Req() request: Request
  ) {
    const adminId = await this.getAdminId(request);
    return this.adminService.updateCoachStatus(adminId, id, body);
  }

  @Post(API_ROUTES.admin.demoClasses)
  async createDemoClass(
    @Body(new ZodBodyPipe(createDemoClassRequestSchema))
    body: CreateDemoClassRequest,
    @Req() request: Request
  ) {
    const adminId = await this.getAdminId(request);
    return this.adminService.createDemoClass(adminId, body);
  }

  @Patch(API_ROUTES.admin.updateDemoClass())
  async updateDemoClass(
    @Param('id') id: string,
    @Body(new ZodBodyPipe(updateDemoClassRequestSchema))
    body: UpdateDemoClassRequest,
    @Req() request: Request
  ) {
    const adminId = await this.getAdminId(request);
    return this.adminService.updateDemoClass(adminId, id, body);
  }

  @Patch(API_ROUTES.admin.cancelDemoClass())
  async cancelDemoClass(
    @Param('id') id: string,
    @Req() request: Request
  ) {
    const adminId = await this.getAdminId(request);
    return this.adminService.cancelDemoClass(adminId, id);
  }

  @Patch(API_ROUTES.admin.restoreDemoClass())
  async restoreDemoClass(
    @Param('id') id: string,
    @Req() request: Request
  ) {
    const adminId = await this.getAdminId(request);
    return this.adminService.restoreDemoClass(adminId, id);
  }

  @Get(API_ROUTES.admin.demoClasses)
  async listDemoClasses(
    @Query() query: PaginatedQuery & { status?: string },
    @Req() request: Request
  ) {
    await this.getAdminId(request);
    return this.adminService.listDemoClasses(query);
  }

  @Post(API_ROUTES.admin.demoClassInvitees())
  async addDemoInvitees(
    @Param('id') id: string,
    @Body(new ZodBodyPipe(addDemoInviteesRequestSchema)) body: AddDemoInviteesRequest,
    @Req() request: Request
  ) {
    const adminId = await this.getAdminId(request);
    return this.adminService.addDemoInvitees(adminId, id, body);
  }

  @Delete(API_ROUTES.admin.removeDemoClassInvitee())
  async removeDemoInvitee(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Req() request: Request
  ) {
    const adminId = await this.getAdminId(request);
    return this.adminService.removeDemoInvitee(adminId, id, registrationId);
  }

  @Get(API_ROUTES.admin.demoClassDetails())
  async getDemoClassDetails(
    @Param('id') id: string,
    @Req() request: Request
  ) {
    const adminId = await this.getAdminId(request);
    return this.adminService.getDemoClassDetails(adminId, id);
  }

  @Get(API_ROUTES.admin.batchClasses)
  async listBatchClasses(
    @Query() query: PaginatedQuery & { status?: string },
    @Req() request: Request
  ) {
    await this.getAdminId(request);
    return this.adminService.listBatchClasses(query);
  }

  @Get(API_ROUTES.admin.batchClassDetails())
  async getBatchClassDetails(
    @Param('id') id: string,
    @Req() request: Request
  ) {
    const adminId = await this.getAdminId(request);
    return this.adminService.getBatchClassDetails(adminId, id);
  }
}
