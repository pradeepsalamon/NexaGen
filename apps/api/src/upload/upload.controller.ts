import {
  Controller,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  Body,
  Req,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
  ForbiddenException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { API_ROUTES } from '@nexa-chess/types';
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from './upload.service';
import { authenticateUser } from '../auth/authenticate';
import { RequireAccessTokenInterceptor } from '../common/security/require-access-token.interceptor';

const MAX_PGN_LENGTH = 512 * 1024; // 512KB of PGN text
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Controller()
export class UploadController {

  constructor(
    private readonly uploadService: UploadService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(API_ROUTES.upload.image)
  // Auth before multer, and multer capped, so the body never sits in memory
  // unbounded or for an anonymous caller.
  @UseInterceptors(
    RequireAccessTokenInterceptor,
    FileInterceptor('file', { limits: { fields: 5, fileSize: MAX_IMAGE_BYTES, files: 1 } }),
  )
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_BYTES }),
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
      }),
    ) file: Express.Multer.File,
    @Req() request: Request,
  ) {
    await this.getAuthenticatedUser(request);

    const result = await this.uploadService.uploadImage(file);
    return { url: result.secure_url };
  }

  @Delete(API_ROUTES.upload.image)
  async deleteImage(@Body('url') url: string, @Req() request: Request) {
    const user = await this.getAuthenticatedUser(request);

    if (!url) {
      throw new BadRequestException('URL is required');
    }

    // Only the owner of the image, or an admin, may delete it. Without this an
    // authenticated user could delete any other user's avatar by URL.
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isAdmin && user.avatarUrl !== url) {
      throw new ForbiddenException('You can only delete your own image.');
    }

    // `avatarUrl` is a free-form profile field, so "it is my avatar" proves
    // nothing on its own: anyone could copy a coach's avatar URL into their own
    // profile and then delete the coach's image. A non-admin may only delete a
    // profile upload that no other account is using.
    if (!isAdmin) {
      const sharedWith = await this.prisma.withDeleted.user.count({
        where: { avatarUrl: url, id: { not: user.id } },
      });
      if (!this.uploadService.isProfileImageUrl(url) || sharedWith > 0) {
        throw new ForbiddenException('You can only delete your own image.');
      }
    }

    await this.uploadService.deleteImage(url);
    return { success: true };
  }

  @Post(API_ROUTES.upload.pgn)
  async uploadPgn(
    @Body('pgn') pgnContent: unknown,
    @Req() request: Request,
    @Body('filename') filename?: unknown,
  ) {
    const user = await this.getAuthenticatedUser(request);
    if (user.role === UserRole.STUDENT) {
      throw new ForbiddenException('Only coaches and admins can save PGNs.');
    }

    if (typeof pgnContent !== 'string' || !pgnContent) {
      throw new BadRequestException('PGN content is required');
    }
    if (filename !== undefined && typeof filename !== 'string') {
      throw new BadRequestException('filename must be a string');
    }

    if (pgnContent.length > MAX_PGN_LENGTH) {
      throw new BadRequestException('PGN content is too large.');
    }

    const result = await this.uploadService.uploadPgn(pgnContent, filename);
    return { url: result.secure_url };
  }

  private getAuthenticatedUser(request: Request) {
    return authenticateUser(
      this.jwtService,
      this.prisma,
      request.cookies?.[AUTH_COOKIE_NAMES.accessToken],
    );
  }
}
