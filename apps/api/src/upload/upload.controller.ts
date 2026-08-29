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
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { getApiEnv } from '@nexa-chess/config/api';
import { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import type { AccessTokenPayload } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from './upload.service';

const MAX_PGN_LENGTH = 512 * 1024; // 512KB of PGN text

@Controller('upload')
export class UploadController {
  private readonly env = getApiEnv();

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

  @Post('pdf')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPdf(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 20 }), // 20MB
          new FileTypeValidator({ fileType: 'application/pdf' }),
        ],
      }),
    ) file: Express.Multer.File,
    @Req() request: Request,
  ) {
    await this.getAuthenticatedUser(request);

    const result = await this.uploadService.uploadPdf(file);
    return { url: result.secure_url };
  }

  private async getAuthenticatedUser(request: Request) {
    const accessToken = request.cookies?.[AUTH_COOKIE_NAMES.accessToken];

    if (!accessToken) {
      throw new UnauthorizedException('Access token is missing.');
    }

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
      accessToken,
      { secret: this.env.JWT_ACCESS_SECRET },
    );

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid session.');
    }

    return user;
  }
}
