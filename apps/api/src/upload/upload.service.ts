import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

export function safePgnBaseName(filename: string): string {
  const base = filename.replace(/\.pgn$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 64);
  return base || 'game';
}

const PROFILE_IMAGE_FOLDER = 'nexa_chess/profiles';

// Only images uploaded through /upload/image, so an avatar can't be an external tracking pixel.
export function isProfileImageUrl(url: string, cloudName = process.env.CLOUDINARY_CLOUD_NAME): boolean {
  if (!cloudName) return false;
  try {
    const { hostname, pathname, protocol } = new URL(url);
    const prefix = `/${cloudName}/image/upload/`;
    if (protocol !== 'https:' || hostname !== 'res.cloudinary.com' || !pathname.startsWith(prefix)) {
      return false;
    }
    const rest = pathname.slice(prefix.length).replace(/^v\d+\//, '');
    return rest.startsWith(`${PROFILE_IMAGE_FOLDER}/`) && !rest.includes('..');
  } catch {
    return false;
  }
}

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
