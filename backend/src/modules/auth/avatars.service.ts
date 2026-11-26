import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { User } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import type { UserResponse } from './dto/user.dto';
import { UsersService } from './users.service';

/** Same limit as `user_avatars_size_ck`. The PWA shrinks photos to 512 px first, so real ones are far smaller. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** Multer's hard cap; anything between this and AVATAR_MAX_BYTES gets the friendlier IMAGE_INVALID. */
export const AVATAR_UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;

export type AvatarType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

/** The type comes from the file's own bytes, never from the client's Content-Type or file name. */
export function detectImageType(buf: Buffer): AvatarType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** Profile photos, stored in PostgreSQL (`user_avatars`) next to the account they belong to. */
@Injectable()
export class AvatarsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /** Replaces the photo of `userId`. `actor` is recorded in the audit log when an admin does it. */
  async set(userId: string, file: UploadedImage | undefined, actor?: AuthUser): Promise<UserResponse> {
    if (!file?.buffer?.length || file.size > AVATAR_MAX_BYTES) throw new AppException('IMAGE_INVALID');
    const type = detectImageType(file.buffer);
    if (!type) throw new AppException('IMAGE_INVALID');
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(User);
      if (!(await repo.existsBy({ id: userId }))) throw new AppException('NOT_FOUND');
      const now = new Date();
      await em.query(
        `INSERT INTO user_avatars (user_id, content_type, data, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
        [userId, type, file.buffer, now],
      );
      await repo.update({ id: userId }, { avatarUpdatedAt: now });
      if (actor) {
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'user.avatar.set',
            entity: 'user',
            entityId: userId,
            after: { content_type: type, bytes: file.size },
          },
          em,
        );
      }
      return this.users.toResponse((await repo.findOneBy({ id: userId }))!);
    });
  }

  async remove(userId: string, actor?: AuthUser): Promise<UserResponse> {
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(User);
      const user = await repo.findOneBy({ id: userId });
      if (!user) throw new AppException('NOT_FOUND');
      await em.query(`DELETE FROM user_avatars WHERE user_id = $1`, [userId]);
      await repo.update({ id: userId }, { avatarUpdatedAt: null });
      if (actor && user.avatarUpdatedAt) {
        await this.audit.record(
          { actorId: actor.id, action: 'user.avatar.delete', entity: 'user', entityId: userId },
          em,
        );
      }
      return this.users.toResponse((await repo.findOneBy({ id: userId }))!);
    });
  }

  async get(userId: string): Promise<{ contentType: AvatarType; data: Buffer; updatedAt: Date }> {
    const rows: { content_type: AvatarType; data: Buffer; updated_at: Date }[] = await this.dataSource.query(
      `SELECT content_type, data, updated_at FROM user_avatars WHERE user_id = $1`,
      [userId],
    );
    if (!rows.length) throw new AppException('NOT_FOUND');
    return { contentType: rows[0].content_type, data: rows[0].data, updatedAt: rows[0].updated_at };
  }
}
