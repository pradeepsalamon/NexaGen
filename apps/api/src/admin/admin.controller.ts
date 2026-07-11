import { Controller, Get, Patch, Param, Body, Req, UnauthorizedException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { API_ROUTES } from '@nexa-gen/types';
import type { UpdateCoachStatusRequest } from '@nexa-gen/types';
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { getApiEnv } from '@nexa-gen/config/api';

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
    
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: getApiEnv().JWT_ACCESS_SECRET
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.role !== 'SUPER_ADMIN') {
        throw new UnauthorizedException('Only Super Admins can perform this action.');
      }
      return user.id;
    } catch {
      throw new UnauthorizedException();
    }
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
}
