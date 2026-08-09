import { Controller, Get, Post, Delete, Query, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { BackupService } from './backup.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import type { AccessTokenPayload } from '../auth/types';
import { getApiEnv } from '@nexa-chess/config/api';

@Controller('admin/backups')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
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

  @Get()
  async listBackups(@Req() request: Request) {
    await this.getAdminId(request);
    return this.backupService.listBackups();
  }

  @Post('trigger')
  async triggerBackup(@Req() request: Request) {
    await this.getAdminId(request);
    return this.backupService.triggerBackup();
  }

  @Get('download')
  async getDownloadUrl(
    @Query('key') key: string,
    @Req() request: Request
  ) {
    await this.getAdminId(request);
    if (!key) {
      throw new BadRequestException('Backup key is required');
    }
    return this.backupService.getDownloadUrl(key);
  }

  @Delete()
  async deleteBackup(
    @Query('key') key: string,
    @Req() request: Request
  ) {
    await this.getAdminId(request);
    if (!key) {
      throw new BadRequestException('Backup key is required');
    }
    return this.backupService.deleteBackup(key);
  }
}
