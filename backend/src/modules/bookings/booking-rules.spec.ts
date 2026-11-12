import { EXAMPLE_RESOURCES } from '../../database/seeds/example-data';
import { TEST_USERS } from '../../testing/test-app';
import { DEFAULT_RULES } from '../settings/settings.service';
import { bookingHorizon, checkBookingRules, quotaView, RuleInput } from './booking-rules';

const TZ = 'Europe/Chisinau';
/** Wednesday 2026-11-11 10:00 local; the spec example slot is Thursday 18:00–19:00. */
const NOW = new Date('2026-11-11T10:00:00+02:00');
const SLOT = { start: new Date('2026-11-12T18:00:00+02:00'), end: new Date('2026-11-12T19:00:00+02:00') };
const court = { active: true, externalAccess: 'leftover' as const, externalAccessWindows: null };

function input(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    user: TEST_USERS.student,
    resource: court,
    slot: SLOT,
    now: NOW,
    rules: DEFAULT_RULES,
    zone: TZ,
    quota: { used: 1, refunded: 0 },
    activeBookings: 0,
    ...overrides,
  };
}

describe('quotaView', () => {
  it('matches the Quota example (limit 4, used 3, refunded 1 -> remaining 2)', () => {
    expect(quotaView({ used: 3, refunded: 1 }, 4)).toEqual({
      limit: 4,
      used: 3,
      refunded: 1,
      remaining: 2,
      over_quota_last_24h_only: false,
    });
  });
  it('never goes below zero', () => {
    expect(quotaView({ used: 6, refunded: 0 }, 4)).toMatchObject({
      remaining: 0,
      over_quota_last_24h_only: true,
    });
  });
});

describe('bookingHorizon (BR-03)', () => {
  it('7 days students, 14 days teachers/admins, 24 h externals', () => {
    const day = 86_400_000;
    expect(bookingHorizon('student', NOW, DEFAULT_RULES).getTime() - NOW.getTime()).toBe(7 * day);
    expect(bookingHorizon('teacher', NOW, DEFAULT_RULES).getTime() - NOW.getTime()).toBe(14 * day);
    expect(bookingHorizon('admin', NOW, DEFAULT_RULES).getTime() - NOW.getTime()).toBe(14 * day);
    expect(bookingHorizon('external', NOW, DEFAULT_RULES).getTime() - NOW.getTime()).toBe(day);
  });
});

describe('checkBookingRules (SDD 7.1)', () => {
  it('accepts the spec example booking', () => {
    expect(checkBookingRules(input())).toBeNull();
  });

  it('ACCOUNT_SUSPENDED first', () => {
    expect(
      checkBookingRules(input({ user: TEST_USERS.suspended, resource: { ...court, active: false } })),
    ).toBe('ACCOUNT_SUSPENDED');
  });

  it('RESOURCE_INACTIVE', () => {
    expect(checkBookingRules(input({ resource: { ...court, active: false } }))).toBe('RESOURCE_INACTIVE');
  });

  it('INVALID_SLOT for a slot that already started', () => {
    expect(checkBookingRules(input({ now: new Date('2026-11-12T18:00:00+02:00') }))).toBe('INVALID_SLOT');
  });

  it('WINDOW_EXCEEDED beyond 7 days for students, but fine for teachers', () => {
    const in10Days = {
      start: new Date('2026-11-21T18:00:00+02:00'),
      end: new Date('2026-11-21T19:00:00+02:00'),
    };
    expect(checkBookingRules(input({ slot: in10Days }))).toBe('WINDOW_EXCEEDED');
    expect(checkBookingRules(input({ slot: in10Days, user: TEST_USERS.teacher }))).toBeNull();
  });

  it('externals: 24 h window and resource access policy', () => {
    const soon = { start: new Date('2026-11-11T18:00:00+02:00'), end: new Date('2026-11-11T19:00:00+02:00') };
    const ext = TEST_USERS.external;
    expect(checkBookingRules(input({ user: ext, slot: SLOT }))).toBe('WINDOW_EXCEEDED');
    expect(checkBookingRules(input({ user: ext, slot: soon }))).toBeNull();
    expect(
      checkBookingRules(input({ user: ext, slot: soon, resource: { ...court, externalAccess: 'never' } })),
    ).toBe('EXTERNAL_ACCESS_DENIED');
    const hall = EXAMPLE_RESOURCES.sportsHall; // window: Saturday 09–18 only
    const windowed = {
      active: true,
      externalAccess: 'window' as const,
      externalAccessWindows: hall.external_access_windows,
    };
    expect(checkBookingRules(input({ user: ext, slot: soon, resource: windowed }))).toBe(
      'EXTERNAL_ACCESS_DENIED',
    );
    const saturdayNow = new Date('2026-11-14T08:00:00+02:00');
    const saturdaySlot = {
      start: new Date('2026-11-14T10:00:00+02:00'),
      end: new Date('2026-11-14T11:30:00+02:00'),
    };
    expect(
      checkBookingRules(input({ user: ext, now: saturdayNow, slot: saturdaySlot, resource: windowed })),
    ).toBeNull();
  });

  it('QUOTA_EXHAUSTED for students, except last-minute slots (FR-28)', () => {
    const exhausted = { used: 4, refunded: 0 };
    expect(checkBookingRules(input({ quota: exhausted }))).toBe('QUOTA_EXHAUSTED');
    const tomorrowMorningNow = new Date('2026-11-12T08:00:00+02:00');
    expect(checkBookingRules(input({ quota: exhausted, now: tomorrowMorningNow }))).toBeNull();
    expect(checkBookingRules(input({ quota: { used: 4, refunded: 1 } }))).toBeNull();
    expect(checkBookingRules(input({ quota: exhausted, user: TEST_USERS.teacher }))).toBeNull();
  });

  it('ACTIVE_LIMIT_REACHED at 2 active bookings (BR-02), not for admins', () => {
    expect(checkBookingRules(input({ activeBookings: 2 }))).toBe('ACTIVE_LIMIT_REACHED');
    expect(checkBookingRules(input({ activeBookings: 1 }))).toBeNull();
    expect(checkBookingRules(input({ activeBookings: 5, user: TEST_USERS.admin }))).toBeNull();
  });
});
