import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

export function safePgnBaseName(filename: string): string {
  const base = filename.replace(/\.pgn$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 64);
  return base || 'game';
}

const PROFILE_IMAGE_FOLDER = 'nexa_chess/profiles';

@Injectable()
export class UploadService {
  uploadImage(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: PROFILE_IMAGE_FOLDER,
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

  /** Whether `url` names an image `uploadImage` stored (the profiles folder). */
  isProfileImageUrl(url: string): boolean {
    return this.publicIdOf(url)?.startsWith(`${PROFILE_IMAGE_FOLDER}/`) ?? false;
  }

  async deleteImage(url: string): Promise<void> {
    try {
      const publicId = this.publicIdOf(url);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (error) {
      console.error('Failed to delete image from Cloudinary', error);
    }
  }

  private publicIdOf(url: string): string | null {
    return url.match(/\/v\d+\/(.+)\.\w+$/)?.[1] ?? null;
  }

  uploadPgn(content: string, filename: string = 'game.pgn'): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'nexa_chess/pgns',
          resource_type: 'raw',
          public_id: `${Date.now()}_${safePgnBaseName(filename)}.pgn`,
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
}
