import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { Page, pageOf, pageOffset } from '../../common/http/pagination';
import { toIsoInZone, toIsoOrNull } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import { Rules, RULE_KEYS, RulesSnapshot, SettingsService } from '../settings/settings.service';
import { AuditEntryResponse, AuditQueryDto, SettingsDto, SettingsResponse } from './dto/admin.dto';

/** SDD module "Administrare și rapoarte" (FR-43 – FR-46). */
@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private toSettingsResponse(s: RulesSnapshot): SettingsResponse {
    return {
      ...s.rules,
      updated_by: s.updatedBy,
      updated_at: toIsoOrNull(s.updatedAt, this.config.facilityTimezone),
    };
  }

  async getSettings(): Promise<SettingsResponse> {
    return this.toSettingsResponse(await this.settings.snapshot());
  }

  /** Applied on the next request, no redeploy (SDD 2.1); old and new values go to the audit log. */
  async updateSettings(actor: AuthUser, dto: SettingsDto): Promise<SettingsResponse> {
    const perSport = dto.monthly_quota_per_sport ?? {};
    if (Object.keys(perSport).length) {
      // monthly_quota is keyed by (user, month) only; a per-sport quota needs the schema change from SRS 9.7.
      throw new AppException('VALIDATION_FAILED', {
        message_ro: 'Cota separată per sport nu este încă disponibilă.',
        message_en: 'A separate quota per sport is not available yet.',
        details: {
          fields: { monthly_quota_per_sport: ['must be empty until per-sport quotas are supported'] },
        },
      });
    }
    const next: Rules = { ...dto, monthly_quota_per_sport: perSport };
    return this.dataSource.transaction(async (em) => {
      const before = await this.settings.snapshot(em);
      const changed = RULE_KEYS.filter((k) => JSON.stringify(before.rules[k]) !== JSON.stringify(next[k]));
      for (const key of changed) {
        await em.query(
          `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [key, JSON.stringify(next[key]), actor.id],
        );
      }
      if (changed.length) {
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'settings.update',
            entity: 'settings',
            before: Object.fromEntries(changed.map((k) => [k, before.rules[k]])),
            after: Object.fromEntries(changed.map((k) => [k, next[k]])),
          },
          em,
        );
      }
      return this.toSettingsResponse(await this.settings.snapshot(em));
    });
  }

  /** Read-only view of the insert-only audit log (FR-45). */
  async auditLog(query: AuditQueryDto): Promise<Page<AuditEntryResponse>> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.actor) where.push(`actor_id = $${params.push(query.actor)}`);
    if (query.entity) where.push(`entity = $${params.push(query.entity)}`);
    if (query.from) where.push(`at >= $${params.push(query.from)}`);
    if (query.to) where.push(`at < $${params.push(query.to)}`);
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { skip, take } = pageOffset(query);
    const [rows, count]: [
      {
        id: string;
        actor_id: string | null;
        action: string;
        entity: string;
        entity_id: string | null;
        before: never;
        after: never;
        at: Date;
      }[],
      { n: string }[],
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT id, actor_id, action, entity, entity_id, before, after, at FROM audit_log ${sqlWhere}
         ORDER BY at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, take, skip],
      ),
      this.dataSource.query(`SELECT count(*) AS n FROM audit_log ${sqlWhere}`, params),
    ]);
    return pageOf(
      query,
      rows.map((r) => ({ ...r, at: toIsoInZone(r.at, this.config.facilityTimezone) })),
      Number(count[0].n),
    );
  }
}
