import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class UploadService {
  uploadImage(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'nexa_chess/profiles',
          allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        },
        (error, result) => {
          if (error) return reject(new BadRequestException(error.message));
          resolve(result as UploadApiResponse);
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  async deleteImage(url: string): Promise<void> {
    try {
      const match = url.match(/\/v\d+\/(.+)\.\w+$/);
      if (match && match[1]) {
        const publicId = match[1];
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (error) {
      console.error('Failed to delete image from Cloudinary', error);
    }
  }

  uploadPgn(content: string, filename: string = 'game.pgn'): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'nexa_chess/pgns',
          resource_type: 'raw',
          public_id: `${Date.now()}_${filename.replace('.pgn', '')}.pgn`,
        },
        (error, result) => {
          if (error) return reject(new BadRequestException(error.message));
          resolve(result as UploadApiResponse);
        },
      );

      const buffer = Buffer.from(content, 'utf-8');
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  uploadPdf(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const originalName = (file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'nexa_chess/pdfs',
          resource_type: 'raw',
          public_id: `${Date.now()}_${originalName}.pdf`,
        },
        (error, result) => {
          if (error) return reject(new BadRequestException(error.message));
          resolve(result as UploadApiResponse);
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }
}
