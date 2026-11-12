import { EXAMPLE_BOOKING, EXAMPLE_RESOURCES, EXAMPLE_USERS } from '../../database/seeds/example-data';
import { TEST_CONFIG } from '../../testing/test-app';
import { pickAlternatives } from './alternatives';
import { renderMessage } from './messages';
import { NotificationDeliveryService } from './notification-delivery.service';

const TZ = 'Europe/Chisinau';
const booking = {
  resourceName: 'Teren baschet 2',
  start: new Date(EXAMPLE_BOOKING.start),
  end: new Date(EXAMPLE_BOOKING.end),
};

describe('renderMessage', () => {
  it('confirmation in Romanian and English', () => {
    expect(renderMessage({ type: 'booking-confirmed', data: {} }, booking, 'ro', TZ).body).toBe(
      'Teren baschet 2, joi 12 noiembrie la 18:00. Arată codul QR la intrare.',
    );
    expect(renderMessage({ type: 'booking-confirmed', data: {} }, booking, 'en', TZ).body).toBe(
      'Teren baschet 2, Thursday 12 November at 18:00. Show the QR code at the entrance.',
    );
  });

  it('reminders 24 h and 1 h before', () => {
    expect(
      renderMessage({ type: 'booking-reminder', data: { hours_before: 24 } }, booking, 'ro', TZ).body,
    ).toMatch(/^Mâine: Teren baschet 2 la 18:00/);
    expect(
      renderMessage({ type: 'booking-reminder', data: { hours_before: 1 } }, booking, 'en', TZ).body,
    ).toMatch(/^In one hour: Teren baschet 2 at 18:00/);
  });

  it('cancellation by an emergency lists the reason and alternatives', () => {
    const msg = renderMessage(
      { type: 'booking-cancelled', data: { cancel_source: 'emergency', reason: 'Avarie' } },
      booking,
      'ro',
      TZ,
      [{ resourceName: 'Sala polivalentă', start: new Date('2026-11-12T18:00:00+02:00') }],
    );
    expect(msg.title).toBe('Rezervare anulată');
    expect(msg.body).toContain('din cauza: o urgență (Avarie)');
    expect(msg.body).toContain('Alternative: Sala polivalentă 18:00.');
  });

  it('waitlist offer with a deadline, or first-come when simultaneous', () => {
    const data = {
      waitlist_id: 'w1',
      resource_name: 'Teren baschet 2',
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
    };
    expect(
      renderMessage(
        { type: 'waitlist-offer', data: { ...data, expires_at: '2026-11-12T14:10:00Z' } },
        null,
        'ro',
        TZ,
      ).body,
    ).toContain('Confirmă până la 16:10.');
    const now = renderMessage(
      { type: 'waitlist-offer', data: { ...data, expires_at: null } },
      null,
      'en',
      TZ,
    );
    expect(now.body).toContain('The first to confirm gets the spot.');
    expect(now.url).toBe('/waitlist/w1');
  });
});

describe('pickAlternatives', () => {
  const court = EXAMPLE_RESOURCES.basketballCourt;
  const hall = EXAMPLE_RESOURCES.sportsHall;
  const resources = [
    { id: court.id, name: court.name, openingHours: court.opening_hours, slotMinutes: 60 },
    { id: hall.id, name: hall.name, openingHours: hall.opening_hours, slotMinutes: 90 },
  ];

  it('picks up to 3 free future slots closest to the cancelled one', () => {
    const original = {
      start: new Date('2026-11-12T18:00:00+02:00'),
      end: new Date('2026-11-12T19:00:00+02:00'),
    };
    const result = pickAlternatives({
      resources,
      occupied: [
        { resourceId: court.id, start: original.start, end: null }, // the emergency block
        {
          resourceId: hall.id,
          start: new Date('2026-11-12T17:30:00+02:00'),
          end: new Date('2026-11-12T19:00:00+02:00'),
        },
      ],
      original,
      day: '2026-11-12',
      zone: TZ,
      now: new Date('2026-11-12T16:05:00+02:00'),
    });
    expect(result.map((s) => `${s.resourceName} ${s.start.toISOString()}`)).toEqual([
      'Sala polivalentă 2026-11-12T17:00:00.000Z',
      'Teren baschet 2 2026-11-12T15:00:00.000Z',
      'Sala polivalentă 2026-11-12T18:30:00.000Z', // 16:00 local already started at 16:05
    ]);
  });
});

describe('NotificationDeliveryService', () => {
  const user = {
    id: EXAMPLE_USERS.student.id,
    email: EXAMPLE_USERS.student.email,
    phone: '+37360000000',
    notification_preferences: { push: true, email: false, sms: false, language: 'ro' },
  };
  const bookingRow = {
    id: EXAMPLE_BOOKING.id,
    resource_id: court(),
    resource_name: 'Teren baschet 2',
    user_id: user.id,
    start: new Date(EXAMPLE_BOOKING.start),
    end: new Date(EXAMPLE_BOOKING.end),
    status: 'active',
  };
  function court() {
    return EXAMPLE_RESOURCES.basketballCourt.id;
  }

  function setup(
    opts: {
      prefs?: object;
      subs?: object[];
      pushOutcome?: 'delivered' | 'gone' | 'failed';
      status?: string;
    } = {},
  ) {
    const inserts: unknown[][] = [];
    const deletes: unknown[][] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (/FROM users WHERE id/.test(sql))
        return [{ ...user, notification_preferences: { ...user.notification_preferences, ...opts.prefs } }];
      if (/FROM occupancy o\s+JOIN resources/.test(sql))
        return [{ ...bookingRow, status: opts.status ?? 'active' }];
      if (/DELETE FROM push_subscriptions/.test(sql)) {
        deletes.push(params);
        return [];
      }
      if (/FROM push_subscriptions/.test(sql))
        return (
          opts.subs ?? [
            { id: 's1', endpoint: 'https://push.example.com/1', keys: { p256dh: 'x', auth: 'y' } },
          ]
        );
      if (/INSERT INTO notifications/.test(sql)) inserts.push(params);
      return [];
    });
    const push = {
      send: jest.fn(async () => ({
        outcome: opts.pushOutcome ?? 'delivered',
        ...(opts.pushOutcome && opts.pushOutcome !== 'delivered' ? { error: 'x' } : {}),
      })),
    };
    const mail = { send: jest.fn() };
    const sms = { send: jest.fn() };
    const service = new NotificationDeliveryService(
      { query } as never,
      push as never,
      mail as never,
      sms as never,
      TEST_CONFIG,
    );
    return { service, inserts, deletes, push, mail, sms };
  }

  it('follows preferences: push only', async () => {
    const { service, inserts, mail, sms } = setup();
    const results = await service.deliver({
      type: 'booking-confirmed',
      userId: user.id,
      occupancyId: EXAMPLE_BOOKING.id,
      data: {},
    });
    expect(results).toEqual([{ channel: 'push', delivered: true }]);
    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
    expect(inserts[0][4]).toBe('push');
  });

  it('critical notices ignore preferences and fall back to SMS when push fails (FR-36)', async () => {
    const { service, mail, sms, inserts, deletes } = setup({ prefs: { push: false }, pushOutcome: 'gone' });
    const results = await service.deliver({
      type: 'booking-cancelled',
      userId: user.id,
      occupancyId: EXAMPLE_BOOKING.id,
      blockId: 'block-1',
      critical: true,
      data: { cancel_source: 'emergency', reason: 'Avarie' },
    });
    expect(results.map((r) => [r.channel, r.delivered])).toEqual([
      ['push', false],
      ['email', true],
      ['sms', true],
    ]);
    expect(mail.send).toHaveBeenCalled();
    expect(sms.send).toHaveBeenCalledWith(expect.objectContaining({ to: '+37360000000' }));
    expect(deletes).toEqual([['s1']]);
    expect(inserts.every((p) => p[2] === 'block-1')).toBe(true);
  });

  it('skips reminders for bookings that are no longer active', async () => {
    const { service, push } = setup({ status: 'cancelled' });
    expect(
      await service.deliver({
        type: 'booking-reminder',
        userId: user.id,
        occupancyId: EXAMPLE_BOOKING.id,
        data: { hours_before: 1 },
      }),
    ).toEqual([]);
    expect(push.send).not.toHaveBeenCalled();
  });
});
