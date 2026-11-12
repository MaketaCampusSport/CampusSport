import type { Resource } from '../../database/entities';
import { EXAMPLE_BOOKING, EXAMPLE_RESOURCES, EXAMPLE_USERS } from '../../database/seeds/example-data';
import { TEST_USERS } from '../../testing/test-app';
import { DEFAULT_RULES } from '../settings/settings.service';
import { buildGrid, GridInput, GridOccupancy } from './grid';

const TZ = 'Europe/Chisinau';
const NOW = new Date('2026-11-12T08:00:00+02:00');
const ex = EXAMPLE_RESOURCES.basketballCourt;
const court: Resource = {
  id: ex.id,
  name: ex.name,
  type: ex.type,
  location: ex.location,
  photoUrl: ex.photo_url,
  capacity: ex.capacity,
  equipment: ex.equipment,
  openingHours: ex.opening_hours,
  slotMinutes: ex.slot_minutes,
  externalAccess: ex.external_access,
  externalAccessWindows: null,
  active: true,
};

/** The spec Booking example (Ion Popescu, 18:00–19:00) and an emergency block 20:00 onwards. */
const studentBooking: GridOccupancy = {
  id: EXAMPLE_BOOKING.id,
  resourceId: court.id,
  start: new Date(EXAMPLE_BOOKING.start),
  end: new Date(EXAMPLE_BOOKING.end),
  kind: 'booking',
  userId: EXAMPLE_USERS.student.id,
  holderName: 'Ion Popescu',
  holderRole: 'student',
};
const externalBooking: GridOccupancy = {
  ...studentBooking,
  id: 'aa0c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4',
  start: new Date('2026-11-12T19:00:00+02:00'),
  end: new Date('2026-11-12T20:00:00+02:00'),
  userId: EXAMPLE_USERS.external.id,
  holderName: 'Ana Rusu',
  holderRole: 'external',
};
const emergency: GridOccupancy = {
  id: 'bb1d2e3f-4a5b-4c6d-9e7f-8091a2b3c4d5',
  resourceId: court.id,
  start: new Date('2026-11-12T20:00:00+02:00'),
  end: null,
  kind: 'emergency',
  userId: null,
  holderName: null,
  holderRole: null,
};

function grid(overrides: Partial<GridInput> = {}) {
  const [resource] = buildGrid({
    resources: [court],
    occupancies: [studentBooking, externalBooking, emergency],
    date: '2026-11-12',
    zone: TZ,
    now: NOW,
    rules: DEFAULT_RULES,
    quota: { used: 0, refunded: 0 },
    activeBookings: 0,
    ...overrides,
  });
  const at = (hhmm: string) => resource.slots.find((s) => s.start === `2026-11-12T${hhmm}:00:00+02:00`)!;
  return { resource, at };
}

describe('buildGrid', () => {
  it('public: states only, no names or ids', () => {
    const { resource, at } = grid();
    expect(resource).toMatchObject({ resource_id: court.id, resource_name: 'Teren baschet 2' });
    expect(resource.slots).toHaveLength(15);
    expect(at('17')).toEqual({
      start: '2026-11-12T17:00:00+02:00',
      end: '2026-11-12T18:00:00+02:00',
      status: 'free',
      bookable: true,
    });
    expect(at('18')).toEqual({
      start: '2026-11-12T18:00:00+02:00',
      end: '2026-11-12T19:00:00+02:00',
      status: 'occupied',
      bookable: false,
    });
    expect(at('20')).toMatchObject({ status: 'blocked', block_kind: 'emergency', bookable: false });
    expect(at('21')).toMatchObject({ status: 'blocked' });
    expect(at('07')).toMatchObject({ status: 'free', bookable: false }); // already started
  });

  it('owner sees "mine" with booking_id; others see occupied + waitlist', () => {
    expect(grid({ caller: TEST_USERS.student }).at('18')).toEqual({
      start: '2026-11-12T18:00:00+02:00',
      end: '2026-11-12T19:00:00+02:00',
      status: 'mine',
      bookable: false,
      booking_id: EXAMPLE_BOOKING.id,
    });
    expect(grid({ caller: TEST_USERS.teacher }).at('18')).toMatchObject({
      status: 'occupied',
      waitlist_available: true,
    });
    expect(grid({ caller: TEST_USERS.teacher }).at('18').booking_id).toBeUndefined();
  });

  it('admin sees holder names and booking ids', () => {
    expect(grid({ caller: TEST_USERS.admin }).at('19')).toMatchObject({
      status: 'occupied',
      holder_name: 'Ana Rusu',
      booking_id: externalBooking.id,
    });
  });

  it('bookable follows the caller rules (quota, active limit)', () => {
    expect(grid({ caller: TEST_USERS.student }).at('17').bookable).toBe(true);
    expect(grid({ caller: TEST_USERS.student, activeBookings: 2 }).at('17').bookable).toBe(false);
    expect(grid({ caller: TEST_USERS.suspended }).at('17').bookable).toBe(false);
  });

  it('FR-24: members may replace an external only when the rule is on', () => {
    expect(grid({ caller: TEST_USERS.student }).at('19').replaceable).toBeUndefined();
    const rules = { ...DEFAULT_RULES, member_replaces_external: true };
    expect(grid({ caller: TEST_USERS.student, rules }).at('19').replaceable).toBe(true);
    expect(grid({ caller: TEST_USERS.student, rules }).at('18').replaceable).toBeUndefined();
  });

  it('externals do not see slots beyond 24 h', () => {
    const tomorrow = grid({ caller: TEST_USERS.external, now: new Date('2026-11-11T12:00:00+02:00') });
    expect(tomorrow.resource.slots.map((s) => s.start).at(-1)).toBe('2026-11-12T12:00:00+02:00');
  });
});
