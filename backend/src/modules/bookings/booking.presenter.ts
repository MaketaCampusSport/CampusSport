import { DateTime } from 'luxon';
import { toIsoInZone, toIsoOrNull } from '../../common/time';
import type { CancelSource, OccupancyStatus, Role } from '../../database/enums';
import type { BookingResponse } from './dto/booking.dto';

/** A booking row joined with its resource and holder. */
export interface BookingRow {
  id: string;
  resource_id: string;
  resource_name: string;
  user_id: string | null;
  start: Date;
  end: Date;
  status: OccupancyStatus;
  cancel_source: CancelSource | null;
  reason: string | null;
  checked_in_at: Date | null;
  participants_count: number | null;
  qr_nonce: string | null;
  holder_name: string | null;
  holder_role: Role | null;
}

export const BOOKING_SELECT = `
  SELECT o.id, o.resource_id, r.name AS resource_name, o.user_id, lower(o.period) AS start, upper(o.period) AS "end",
         o.status, o.cancel_source, o.reason, o.checked_in_at, o.participants_count, o.qr_nonce,
         u.full_name AS holder_name, u.role AS holder_role
  FROM occupancy o
  JOIN resources r ON r.id = o.resource_id
  LEFT JOIN users u ON u.id = o.user_id`;

export function toBookingResponse(
  row: BookingRow,
  zone: string,
  extra: { qrToken?: string; confirmation?: boolean } = {},
): BookingResponse {
  const response: BookingResponse = {
    id: row.id,
    resource_id: row.resource_id,
    resource_name: row.resource_name,
    user_id: row.user_id,
    start: toIsoInZone(row.start, zone),
    end: toIsoInZone(row.end, zone),
    status: row.status,
    checked_in_at: toIsoOrNull(row.checked_in_at, zone),
    participants_count: row.participants_count,
  };
  if (row.cancel_source) {
    response.cancel_source = row.cancel_source;
    response.cancel_reason = row.reason;
  }
  if (extra.qrToken) response.qr_token = extra.qrToken;
  if (extra.confirmation) Object.assign(response, confirmationMessages(row.resource_name, row.start, zone));
  return response;
}

/** Success screen text (spec example: "Gata! Te așteptăm joi la 18:00 pe Teren baschet 2."). */
export function confirmationMessages(resourceName: string, start: Date, zone: string): { message_ro: string; message_en: string } {
  const t = DateTime.fromJSDate(start, { zone });
  const hour = t.toFormat('HH:mm');
  return {
    message_ro: `Gata! Te așteptăm ${t.setLocale('ro').toFormat('cccc')} la ${hour} pe ${resourceName}.`,
    message_en: `All set! See you ${t.setLocale('en').toFormat('cccc')} at ${hour} on ${resourceName}.`,
  };
}
