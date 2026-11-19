import { describe, expect, it } from 'vitest';
import type { Dashboard, MonthlyReport, Resource } from '@/api/client';
import { toAnnouncement } from '@/features/admin/announcements/AnnouncementsPage';
import { blockState } from '@/features/admin/blocks/BlocksPage';
import { dashboardKpis, toDayGrid } from '@/features/admin/dashboard/grid';
import { toReportView } from '@/features/admin/reports/ReportsPage';
import { hasMixedHours, toForm, toResourceInput } from '@/features/admin/resources/resourceForm';
import { toScheduleClass } from '@/features/admin/schedule/SchedulePage';
import { suspensionUntil } from '@/features/admin/users/UsersPage';

describe('Resurse: WeeklyHours ↔ formular', () => {
  const resource: Resource = {
    id: 'r-1',
    name: 'Teren',
    type: 'teren',
    location: 'Campus',
    photo_url: null,
    capacity: 10,
    sport_ids: ['s-1'],
    equipment: ['panouri'],
    opening_hours: { mon: [{ open: '08:00', close: '20:00' }], wed: [{ open: '08:00', close: '20:00' }] },
    slot_minutes: 90,
    external_access: 'window',
    external_access_windows: { fri: [{ open: '16:00', close: '18:00' }] },
    active: true,
  };

  it('citește zilele și orele din program', () => {
    const f = toForm(resource);
    expect(f.hours).toEqual({ days: [1, 3], from: '08:00', to: '20:00' });
    expect(f.externalWindow).toEqual({ days: [5], from: '16:00', to: '18:00' });
    expect(f.slotMinutes).toBe(90);
  });

  it('scrie înapoi același program (round-trip)', () => {
    const input = toResourceInput(toForm(resource), true);
    expect(input.opening_hours).toEqual(resource.opening_hours);
    expect(input.external_access_windows).toEqual(resource.external_access_windows);
    expect(input).toMatchObject({ name: 'Teren', photo_url: null, capacity: 10, active: true });
  });

  it('fereastra externă se trimite doar pentru `window`', () => {
    const input = toResourceInput({ ...toForm(resource), externalAccess: 'never' }, true);
    expect(input).not.toHaveProperty('external_access_windows');
  });

  it('recunoaște programul cu ore diferite pe zile', () => {
    expect(hasMixedHours(resource.opening_hours)).toBe(false);
    expect(hasMixedHours({ mon: [{ open: '08:00', close: '20:00' }], tue: [{ open: '10:00', close: '20:00' }] })).toBe(true);
  });
});

describe('Panou: grila și indicatorii din `Dashboard`', () => {
  const d: Dashboard = {
    date: '2026-11-19',
    check_ins_count: 3,
    no_shows_count: 1,
    resources: [
      {
        resource_id: 'r-1',
        resource_name: 'Teren',
        slots: [
          { start: '2026-11-19T08:00:00', end: '2026-11-19T09:00:00', status: 'occupied', bookable: false, holder_name: 'Ana' },
          { start: '2026-11-19T09:00:00', end: '2026-11-19T10:00:00', status: 'free', bookable: true },
          { start: '2026-11-19T10:00:00', end: '2026-11-19T11:30:00', status: 'blocked', bookable: false, block_kind: 'pe_class' },
          { start: '2026-11-19T11:30:00', end: '2026-11-19T13:00:00', status: 'blocked', bookable: false, block_kind: 'emergency' },
        ],
      },
    ],
  };

  it('mapează stările și calculează intervalul orar', () => {
    const g = toDayGrid(d, []);
    expect(g.firstHour).toBe(8);
    expect(g.lastHour).toBe(13);
    expect(g.rows[0]!.cells.map((c) => c.state)).toEqual(['booked', 'free', 'pe_class', 'blocked']);
    expect(g.rows[0]!.cells[2]).toMatchObject({ from: 600, to: 690 });
    expect(g.rows[0]!.cells[0]!.holder).toBe('Ana');
  });

  it('rezervările și ocuparea vin din sloturi, check-in / no-show de la server', () => {
    expect(dashboardKpis(d)).toEqual({ bookings: 1, checkIns: 3, noShows: 1, occupancyPct: 50 });
  });
});

describe('Rapoarte: `MonthlyReport` → procente', () => {
  it('face media pe resurse și pe ore', () => {
    const r: MonthlyReport = {
      month: '2026-10',
      occupancy: [
        { resource_id: 'a', resource_name: 'A', rate: 0.8, by_hour: [{ hour: 18, rate: 1 }] },
        { resource_id: 'b', resource_name: 'B', rate: 0.4, by_hour: [{ hour: 18, rate: 0.5 }] },
      ],
      no_shows_count: 7,
      bookings_by_category: { members: 90, externals: 10 },
      users_reaching_limit_count: 12,
    };
    const v = toReportView(r);
    expect(v).toMatchObject({ occupancyPct: 60, bookings: 100, noShows: 7, atLimit: 12 });
    expect(v.hourly).toEqual([{ hour: 18, pct: 75 }]);
    expect(v.perResource.map((x) => x.pct)).toEqual([80, 40]);
  });
});

describe('Formulare → corpuri de cerere', () => {
  it('anunțul trimite resursa și/sau intervalul', () => {
    const base = { messageRo: ' Salut ', messageEn: '', resourceId: 'r-1', withInterval: false, date: '2026-11-20', from: '10:00', to: '12:00' };
    expect(toAnnouncement(base)).toEqual({ message_ro: 'Salut', resource_id: 'r-1' });
    const withRange = toAnnouncement({ ...base, resourceId: '', withInterval: true, messageEn: 'Hi' });
    expect(withRange).toMatchObject({ message_ro: 'Salut', message_en: 'Hi', start: expect.any(String), end: expect.any(String) });
    expect(withRange).not.toHaveProperty('resource_id');
  });

  it('ora EF manuală devine prima apariție + RRULE săptămânal', () => {
    // 2026-11-16 este luni; prima zi aleasă (miercuri) cade pe 18.
    const c = toScheduleClass({ resourceId: 'r-1', courseName: 'EF', weekdays: [3, 5], from: '10:00', to: '12:00', validFrom: '2026-11-16', validTo: '2026-12-20' });
    expect(c.recurrence).toEqual({ rule: 'FREQ=WEEKLY;BYDAY=WE,FR', valid_from: '2026-11-16', valid_to: '2026-12-20' });
    expect(new Date(c.first_start).getDate()).toBe(18);
    expect(new Date(c.first_start).getHours()).toBe(10);
  });

  it('suspendarea pe N zile devine o dată-oră `until`', () => {
    const now = new Date('2026-11-19T10:00:00Z');
    expect(suspensionUntil(14, now)).toBe('2026-12-03T10:00:00.000Z');
  });

  it('starea unei blocări se calculează față de acum', () => {
    const now = new Date('2026-11-19T10:00:00Z');
    const b = { id: 'b', resource_id: 'r', kind: 'maintenance' as const, reason: '', created_by: 'u' };
    expect(blockState({ ...b, start: '2026-11-19T09:00:00Z', end: null }, now)).toBe('active');
    expect(blockState({ ...b, start: '2026-11-20T09:00:00Z', end: null }, now)).toBe('planned');
    expect(blockState({ ...b, start: '2026-11-18T09:00:00Z', end: '2026-11-18T10:00:00Z' }, now)).toBe('ended');
  });
});
