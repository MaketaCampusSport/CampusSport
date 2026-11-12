import { DateTime } from 'luxon';
import type { NotifyJob } from '../jobs/queues';

export type Language = 'ro' | 'en';

export interface MessageBooking {
  resourceName: string;
  start: Date;
  end: Date;
}

export interface Alternative {
  resourceName: string;
  start: Date;
}

export interface RenderedMessage {
  title: string;
  body: string;
  /** Deep link in the PWA. */
  url: string;
}

const CANCEL_REASON: Record<string, { ro: string; en: string }> = {
  emergency: { ro: 'o urgență', en: 'an emergency' },
  maintenance: { ro: 'lucrări de mentenanță', en: 'maintenance' },
  pe_class: { ro: 'o oră de educație fizică', en: 'a PE class' },
  event: { ro: 'un eveniment al universității', en: 'a university event' },
  admin: { ro: 'decizia administrației', en: 'a decision of the staff' },
  member_priority: { ro: 'prioritatea membrilor universității', en: 'priority for university members' },
};

function when(start: Date, zone: string, lang: Language): string {
  const t = DateTime.fromJSDate(start, { zone }).setLocale(lang);
  return lang === 'ro' ? t.toFormat("cccc d LLLL 'la' HH:mm") : t.toFormat("cccc d LLLL 'at' HH:mm");
}

function time(start: Date, zone: string): string {
  return DateTime.fromJSDate(start, { zone }).toFormat('HH:mm');
}

/** Texts of the worker's notifications, in the user's language (FR-34 – FR-38, SRS 9.3). */
export function renderMessage(
  job: Pick<NotifyJob, 'type' | 'data'>,
  booking: MessageBooking | null,
  lang: Language,
  zone: string,
  alternatives: Alternative[] = [],
): RenderedMessage {
  const ro = lang === 'ro';
  const d = job.data as Record<string, string | number | null | undefined>;
  switch (job.type) {
    case 'booking-confirmed':
      return {
        title: ro ? 'Rezervare confirmată' : 'Booking confirmed',
        body: ro
          ? `${booking!.resourceName}, ${when(booking!.start, zone, lang)}. Arată codul QR la intrare.`
          : `${booking!.resourceName}, ${when(booking!.start, zone, lang)}. Show the QR code at the entrance.`,
        url: '/bookings',
      };
    case 'booking-reminder': {
      const hours = Number(d.hours_before ?? 1);
      const lead = ro ? (hours >= 24 ? 'Mâine' : 'Peste o oră') : hours >= 24 ? 'Tomorrow' : 'In one hour';
      return {
        title: ro ? 'Reminder rezervare' : 'Booking reminder',
        body: ro
          ? `${lead}: ${booking!.resourceName} la ${time(booking!.start, zone)}. Check-in cu 10 minute înainte.`
          : `${lead}: ${booking!.resourceName} at ${time(booking!.start, zone)}. Check in up to 10 minutes before.`,
        url: '/bookings',
      };
    }
    case 'booking-cancelled': {
      const cause = CANCEL_REASON[String(d.cancel_source)] ?? CANCEL_REASON.admin;
      const reason = d.reason ? ` (${d.reason})` : '';
      const alt = alternatives.length
        ? ro
          ? ` Alternative: ${alternatives.map((a) => `${a.resourceName} ${time(a.start, zone)}`).join(', ')}.`
          : ` Alternatives: ${alternatives.map((a) => `${a.resourceName} ${time(a.start, zone)}`).join(', ')}.`
        : '';
      return {
        title: ro ? 'Rezervare anulată' : 'Booking cancelled',
        body: ro
          ? `Rezervarea ta: ${booking!.resourceName}, ${when(booking!.start, zone, lang)}, a fost anulată din cauza: ${cause.ro}${reason}. Intrarea ți-a fost restituită.${alt}`
          : `Your booking: ${booking!.resourceName}, ${when(booking!.start, zone, lang)}, was cancelled due to ${cause.en}${reason}. Your entry has been returned.${alt}`,
        url: '/start',
      };
    }
    case 'waitlist-offer': {
      const start = new Date(String(d.start));
      const name = String(d.resource_name);
      const deadline = d.expires_at
        ? ro
          ? `Confirmă până la ${time(new Date(String(d.expires_at)), zone)}.`
          : `Confirm by ${time(new Date(String(d.expires_at)), zone)}.`
        : ro
          ? 'Primul care confirmă obține locul.'
          : 'The first to confirm gets the spot.';
      return {
        title: ro ? 'S-a eliberat un loc' : 'A spot is free',
        body: ro ? `${name}, ${when(start, zone, lang)}. ${deadline}` : `${name}, ${when(start, zone, lang)}. ${deadline}`,
        url: `/waitlist/${d.waitlist_id}`,
      };
    }
    case 'announcement':
      return {
        title: ro ? 'Anunț CampusSport' : 'CampusSport announcement',
        body: String((ro ? d.message_ro : d.message_en) ?? d.message_ro ?? ''),
        url: '/start',
      };
  }
}
