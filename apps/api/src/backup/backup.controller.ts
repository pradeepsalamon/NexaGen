import { Controller, Get, Post, Delete, Query, Req, ForbiddenException, BadRequestException } from '@nestjs/common';
import { BackupService } from './backup.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { optionalQueryString } from '../common/query-params';
import { authenticateUser } from '../auth/authenticate';
import { isPlatformOperator } from '../platform/platform-operator';
import { API_ROUTES } from '@nexa-chess/types';

@Controller()
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private async getAdminId(request: Request): Promise<string> {
    const user = await authenticateUser(
      this.jwtService,
      this.prisma,
      request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
    );
    // The dump holds every academy's data: Nexa's own super admins only. An
    // academy owner is a SUPER_ADMIN of their academy, never a platform operator.
    if (!isPlatformOperator(user)) {
      throw new ForbiddenException('Platform operators only.');
    }
    return user.id;
  }

  @Get(API_ROUTES.adminBackups.list)
  async listBackups(@Req() request: Request) {
    await this.getAdminId(request);
    return this.backupService.listBackups();
  }

  @Post(API_ROUTES.adminBackups.trigger)
  async triggerBackup(@Req() request: Request) {
    await this.getAdminId(request);
    return this.backupService.triggerBackup();
  }

  @Get(API_ROUTES.adminBackups.download)
  async getDownloadUrl(
    @Query('key') rawKey: unknown,
    @Req() request: Request
  ) {
    await this.getAdminId(request);
    const key = optionalQueryString(rawKey, 'key');
    if (!key) {
      throw new BadRequestException('Backup key is required');
    }
    return this.backupService.getDownloadUrl(key, 'database/');
  }

  @Delete(API_ROUTES.adminBackups.remove)
  async deleteBackup(
    @Query('key') rawKey: unknown,
    @Req() request: Request
  ) {
    await this.getAdminId(request);
    const key = optionalQueryString(rawKey, 'key');
    if (!key) {
      throw new BadRequestException('Backup key is required');
    }
    return this.backupService.deleteBackup(key);
  }
}
