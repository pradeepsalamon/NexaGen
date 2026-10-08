import { Controller, Get, Post, Delete, Query, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { BackupService } from './backup.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { authenticateUser } from '../auth/authenticate';

@Controller('admin/backups')
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
    if (user.role !== 'SUPER_ADMIN') {
      throw new UnauthorizedException('Only Super Admins can perform this action.');
    }
    return user.id;
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
