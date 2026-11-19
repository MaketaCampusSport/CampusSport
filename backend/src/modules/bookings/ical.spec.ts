import { EXAMPLE_BOOKING, EXAMPLE_RESOURCES, EXAMPLE_USERS } from '../../database/seeds/example-data';
import { TEST_CONFIG, TEST_USERS } from '../../testing/test-app';
import { BookingsService } from './bookings.service';
import { bookingCalendar, foldLine, icsDateTime, icsText } from './ical';

const COURT = EXAMPLE_RESOURCES.basketballCourt;
const NOW = new Date('2026-11-11T10:00:00+02:00');
const BOOKING = {
  id: EXAMPLE_BOOKING.id,
  start: new Date(EXAMPLE_BOOKING.start),
  end: new Date(EXAMPLE_BOOKING.end),
  status: 'active',
  resourceName: COURT.name,
  location: COURT.location,
  sportName: 'Baschet',
};

describe('iCalendar helpers', () => {
  it('UTC date-times', () => {
    expect(icsDateTime(new Date('2026-11-12T18:00:00+02:00'))).toBe('20261112T160000Z');
  });

  it('escapes TEXT values', () => {
    expect(icsText('a\\b; c, d\ne')).toBe('a\\\\b\\; c\\, d\\ne');
  });

  it('folds lines at 75 octets without splitting UTF-8 characters', () => {
    const line = `SUMMARY:${'ă'.repeat(80)}`;
    const folded = foldLine(line).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
    expect(foldLine('SHORT:x')).toBe('SHORT:x');
  });
});

describe('bookingCalendar', () => {
  it('one VEVENT with UTC times, CRLF line endings and escaped text', () => {
    const ics = bookingCalendar(BOOKING, NOW);
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(ics.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CampusSport//Booking//RO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:booking-${EXAMPLE_BOOKING.id}@campussport`,
      'DTSTAMP:20261111T080000Z',
      'DTSTART:20261112T160000Z',
      'DTEND:20261112T170000Z',
      'SUMMARY:Baschet – Teren baschet 2',
      'LOCATION:Teren baschet 2\\, 47.0245\\,28.8322',
      'GEO:47.0245;28.8322',
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]);
  });

  it('without a sport or coordinates; cancelled bookings are marked CANCELLED', () => {
    const ics = bookingCalendar(
      { ...BOOKING, sportName: null, location: 'Corpul B; sala 2', status: 'cancelled' },
      NOW,
    );
    expect(ics).toContain('\r\nSUMMARY:CampusSport – Teren baschet 2\r\n');
    expect(ics).toContain('\r\nLOCATION:Teren baschet 2\\, Corpul B\\; sala 2\r\n');
    expect(ics).not.toContain('GEO:');
    expect(ics).toContain('\r\nSTATUS:CANCELLED\r\n');
  });
});

describe('BookingsService.calendar', () => {
  function setup(row: Record<string, unknown> | null) {
    const query = jest.fn(async () => (row ? [row] : []));
    const service = new BookingsService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      TEST_CONFIG,
    );
    return { service, query };
  }
  const ROW = {
    id: EXAMPLE_BOOKING.id,
    user_id: EXAMPLE_USERS.student.id,
    status: 'active',
    start: BOOKING.start,
    end: BOOKING.end,
    resource_name: COURT.name,
    location: COURT.location,
    sport_name: 'Baschet',
  };

  it('the holder gets the event', async () => {
    const { service, query } = setup(ROW);
    const ics = await service.calendar(TEST_USERS.student, EXAMPLE_BOOKING.id, NOW);
    expect(ics).toBe(bookingCalendar(BOOKING, NOW));
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/WHERE o\.id = \$1 AND o\.kind = 'booking'/), [
      EXAMPLE_BOOKING.id,
    ]);
  });

  it('404 for anyone else (admins included) and for unknown bookings', async () => {
    await expect(setup(ROW).service.calendar(TEST_USERS.admin, EXAMPLE_BOOKING.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(setup(null).service.calendar(TEST_USERS.student, EXAMPLE_BOOKING.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
