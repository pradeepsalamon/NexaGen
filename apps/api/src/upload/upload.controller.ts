import { Controller, Post, Delete, UseInterceptors, UploadedFile, Body, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

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
  ) {
    const result = await this.uploadService.uploadImage(file);
    return { url: result.secure_url };
  }

  @Delete('image')
  async deleteImage(@Body('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL is required');
    }
    await this.uploadService.deleteImage(url);
    return { success: true };
  }

  @Post('pgn')
  async uploadPgn(@Body('pgn') pgnContent: string, @Body('filename') filename?: string) {
    if (!pgnContent) {
      throw new BadRequestException('PGN content is required');
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
  ) {
    const result = await this.uploadService.uploadPdf(file);
    return { url: result.secure_url };
  }
}
