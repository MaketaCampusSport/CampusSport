/**
 * Minimal iCalendar (RFC 5545) output for a booking (FR-17), without a library: one VEVENT, times in UTC,
 * escaped TEXT values, lines folded at 75 octets and CRLF line endings.
 */

export interface CalendarBooking {
  id: string;
  start: Date;
  end: Date;
  status: string;
  resourceName: string;
  /** Free text of the resource; `lat,lon` coordinates also produce a GEO property. */
  location: string | null;
  sportName: string | null;
}

/** `YYYYMMDDTHHMMSSZ` (RFC 5545 3.3.5, form #2: UTC). */
export function icsDateTime(instant: Date): string {
  return instant
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');
}

/** TEXT escaping (RFC 5545 3.3.11): backslash, semicolon, comma and line breaks. */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds a content line to at most 75 octets per line (RFC 5545 3.1), never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, 'utf8');
    // Continuation lines start with a space, which counts towards their 75 octets.
    const limit = parts.length ? 74 : 75;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += ch;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const GEO = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export function bookingCalendar(booking: CalendarBooking, now: Date): string {
  const summary = booking.sportName
    ? `${booking.sportName} – ${booking.resourceName}`
    : `CampusSport – ${booking.resourceName}`;
  const location = booking.location?.trim()
    ? `${booking.resourceName}, ${booking.location.trim()}`
    : booking.resourceName;
  const geo = booking.location ? GEO.exec(booking.location) : null;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CampusSport//Booking//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:booking-${booking.id}@campussport`,
    `DTSTAMP:${icsDateTime(now)}`,
    `DTSTART:${icsDateTime(booking.start)}`,
    `DTEND:${icsDateTime(booking.end)}`,
    `SUMMARY:${icsText(summary)}`,
    `LOCATION:${icsText(location)}`,
    ...(geo ? [`GEO:${geo[1]};${geo[2]}`] : []),
    `STATUS:${booking.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
