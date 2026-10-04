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
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from './upload.service';
import { authenticateUser } from '../auth/authenticate';

const MAX_PGN_LENGTH = 512 * 1024; // 512KB of PGN text

@Controller('upload')
export class UploadController {

  constructor(
    private readonly uploadService: UploadService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB
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

  @Delete('image')
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

    await this.uploadService.deleteImage(url);
    return { success: true };
  }

  @Post('pgn')
  async uploadPgn(
    @Body('pgn') pgnContent: string,
    @Req() request: Request,
    @Body('filename') filename?: string,
  ) {
    await this.getAuthenticatedUser(request);

    if (!pgnContent) {
      throw new BadRequestException('PGN content is required');
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
