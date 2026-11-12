import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Setting } from '../../database/entities';

/** Configurable rules (SRS 9.2, `Settings` schema). Keys match the `settings` table. */
export interface Rules {
  monthly_quota: number;
  monthly_quota_per_sport: Record<string, number>;
  max_active_bookings: number;
  booking_window_days_student: number;
  booking_window_days_teacher: number;
  booking_window_hours_external: number;
  cancel_free_hours: number;
  checkin_minutes_before: number;
  checkin_minutes_after: number;
  no_show_threshold: number;
  no_show_suspension_days: number;
  waitlist_offer_minutes: number;
  waitlist_simultaneous_under_hours: number;
  default_slot_minutes: number;
  member_replaces_external: boolean;
}

/** Defaults from the schema's INSERT INTO settings (SRS 9.2); used when a row is missing. */
export const DEFAULT_RULES: Rules = {
  monthly_quota: 4,
  monthly_quota_per_sport: {},
  max_active_bookings: 2,
  booking_window_days_student: 7,
  booking_window_days_teacher: 14,
  booking_window_hours_external: 24,
  cancel_free_hours: 2,
  checkin_minutes_before: 10,
  checkin_minutes_after: 15,
  no_show_threshold: 3,
  no_show_suspension_days: 14,
  waitlist_offer_minutes: 10,
  waitlist_simultaneous_under_hours: 2,
  default_slot_minutes: 60,
  member_replaces_external: false,
};

export const RULE_KEYS = Object.keys(DEFAULT_RULES) as (keyof Rules)[];

export interface RulesSnapshot {
  rules: Rules;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export function rulesFromRows(rows: Pick<Setting, 'key' | 'value' | 'updatedBy' | 'updatedAt'>[]): RulesSnapshot {
  const rules: Rules = { ...DEFAULT_RULES, monthly_quota_per_sport: {} };
  let latest: Pick<Setting, 'updatedBy' | 'updatedAt'> | null = null;
  for (const row of rows) {
    if (!(row.key in DEFAULT_RULES)) continue;
    (rules as unknown as Record<string, unknown>)[row.key] = row.value;
    if (!latest || row.updatedAt > latest.updatedAt) latest = row;
  }
  return { rules, updatedBy: latest?.updatedBy ?? null, updatedAt: latest?.updatedAt ?? null };
}

/** Rules are read from the database on every request, so changes apply without a redeploy (SDD 2.1). */
@Injectable()
export class SettingsService {
  constructor(@InjectRepository(Setting) private readonly repo: Repository<Setting>) {}

  async snapshot(em?: EntityManager): Promise<RulesSnapshot> {
    const repo = em ? em.getRepository(Setting) : this.repo;
    return rulesFromRows(await repo.find());
  }

  async rules(em?: EntityManager): Promise<Rules> {
    return (await this.snapshot(em)).rules;
  }
}
