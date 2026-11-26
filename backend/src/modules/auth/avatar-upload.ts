import { FileInterceptor } from '@nestjs/platform-express';
import type { ApiBodyOptions } from '@nestjs/swagger';
import { AVATAR_UPLOAD_LIMIT_BYTES } from './avatars.service';

/** multipart/form-data with one `file` field (`AvatarUpload` schema). */
export const AVATAR_UPLOAD_BODY: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary', description: 'JPEG, PNG sau WebP, cel mult 2 MB.' },
    },
  },
};

/** Memory storage (the bytes go straight to PostgreSQL) with a hard size cap. */
export const avatarInterceptor = () =>
  FileInterceptor('file', { limits: { fileSize: AVATAR_UPLOAD_LIMIT_BYTES, files: 1 } });
