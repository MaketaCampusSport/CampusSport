import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { AnnouncementCreateDto, AnnouncementResultResponse } from './dto/notifications.dto';

/**
 * Announcements to the holders of matching bookings (FR-38). Each recipient gets an `announcement` job;
 * the worker delivers it over the user's preferred channels and stores it in `notifications`.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Recipients are the distinct holders of active bookings that have not ended yet, on `resource_id`
   * and/or overlapping [`start`, `end`). The audit entry commits with the recipient list; the jobs are
   * enqueued after the commit.
   */
  async create(
    actor: AuthUser,
    dto: AnnouncementCreateDto,
    now = new Date(),
  ): Promise<AnnouncementResultResponse> {
    const { start, end } = this.validate(dto);
    const recipients = await this.dataSource.transaction(async (em) => {
      const where = [`kind = 'booking'`, `status = 'active'`, `user_id IS NOT NULL`];
      const params: unknown[] = [now];
      where.push(`upper(period) > $1`);
      if (dto.resource_id) where.push(`resource_id = $${params.push(dto.resource_id)}`);
      if (start && end) where.push(`period && tstzrange($${params.push(start)}, $${params.push(end)}, '[)')`);
      const rows: { user_id: string }[] = await em.query(
        `SELECT DISTINCT user_id FROM occupancy WHERE ${where.join(' AND ')} ORDER BY user_id`,
        params,
      );
      const userIds = rows.map((r) => r.user_id);
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'announcement.create',
          entity: 'announcement',
          after: {
            resource_id: dto.resource_id ?? null,
            start: start?.toISOString() ?? null,
            end: end?.toISOString() ?? null,
            message_ro: dto.message_ro,
            message_en: dto.message_en ?? null,
            recipients_count: userIds.length,
            recipient_ids: userIds,
          },
        },
        em,
      );
      return userIds;
    });

    for (const userId of recipients) {
      this.jobs.notify({
        type: 'announcement',
        userId,
        data: { message_ro: dto.message_ro, message_en: dto.message_en ?? null },
      });
    }
    return { recipients_count: recipients.length };
  }

  private validate(dto: AnnouncementCreateDto): { start?: Date; end?: Date } {
    const fields: Record<string, string[]> = {};
    const hasInterval = dto.start !== undefined || dto.end !== undefined;
    if (!dto.resource_id && !hasInterval) fields.resource_id = ['resource_id or start + end is required'];
    if (hasInterval && dto.start === undefined) fields.start = ['required together with end'];
    if (hasInterval && dto.end === undefined) fields.end = ['required together with start'];
    const start = dto.start !== undefined ? new Date(dto.start) : undefined;
    const end = dto.end !== undefined ? new Date(dto.end) : undefined;
    if (start && end && end <= start) fields.end = ['must be after start'];
    if (Object.keys(fields).length) throw new AppException('VALIDATION_FAILED', { details: { fields } });
    return { start, end };
  }
}
