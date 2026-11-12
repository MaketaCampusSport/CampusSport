import type { AuthUser } from '../../common/auth/auth.types';
import { toIsoInZone } from '../../common/time';
import type { Resource } from '../../database/entities';
import type { BlockKind, OccupancyKind, Role } from '../../database/enums';
import { bookingHorizon, checkBookingRules, QuotaCounters } from '../bookings/booking-rules';
import type { Rules } from '../settings/settings.service';
import { Interval, overlaps, slotsForDay } from './slots';

export type SlotState = 'free' | 'occupied' | 'mine' | 'blocked';

/** An active occupancy row as needed for the grid. */
export interface GridOccupancy {
  id: string;
  resourceId: string;
  start: Date;
  end: Date | null;
  kind: OccupancyKind;
  userId: string | null;
  holderName: string | null;
  holderRole: Role | null;
}

/** `Slot` schema; optional fields are omitted when they do not apply to the caller. */
export interface SlotView {
  start: string;
  end: string;
  status: SlotState;
  bookable: boolean;
  waitlist_available?: boolean;
  replaceable?: boolean;
  block_kind?: BlockKind;
  booking_id?: string;
  holder_name?: string;
}

export interface ResourceAvailabilityView {
  resource_id: string;
  resource_name: string;
  slots: SlotView[];
}

export interface GridInput {
  resources: Resource[];
  occupancies: GridOccupancy[];
  date: string;
  zone: string;
  now: Date;
  rules: Rules;
  caller?: AuthUser;
  /** Caller's quota for the month of `date`, and active future bookings. */
  quota: QuotaCounters;
  activeBookings: number;
}

/**
 * Builds the slot grid (FR-09, FR-10). Visibility:
 * public sees states only; users see their own bookings and a role-specific `bookable`;
 * externals do not see slots starting beyond their 24 h window (SRS 9.5); admins see holder names.
 */
export function buildGrid(input: GridInput): ResourceAvailabilityView[] {
  const { caller, now, rules, zone } = input;
  const horizon = caller?.role === 'external' ? bookingHorizon('external', now, rules) : null;
  const isMember = caller?.role === 'student' || caller?.role === 'teacher';

  return input.resources.map((resource) => {
    const occupancies = input.occupancies.filter((o) => o.resourceId === resource.id);
    const slots = slotsForDay(resource.openingHours, resource.slotMinutes, input.date, zone)
      .filter((slot) => !horizon || slot.start <= horizon)
      .map((slot) => {
        const occ = occupancies.find((o) => overlaps(o, slot));
        const view: SlotView = {
          start: toIsoInZone(slot.start, zone),
          end: toIsoInZone(slot.end, zone),
          status: stateOf(occ, caller),
          bookable: false,
        };
        if (!occ) {
          view.bookable = caller ? isBookable(input, resource, slot) : slot.start > now;
          return view;
        }
        if (occ.kind !== 'booking') {
          view.block_kind = occ.kind;
          return view;
        }
        if (caller && (occ.userId === caller.id || caller.role === 'admin')) view.booking_id = occ.id;
        if (caller?.role === 'admin' && occ.holderName) view.holder_name = occ.holderName;
        if (view.status === 'occupied' && caller && caller.role !== 'admin' && slot.start > now) {
          view.waitlist_available = true;
          if (isMember && rules.member_replaces_external && occ.holderRole === 'external')
            view.replaceable = true;
        }
        return view;
      });
    return { resource_id: resource.id, resource_name: resource.name, slots };
  });
}

function stateOf(occ: GridOccupancy | undefined, caller: AuthUser | undefined): SlotState {
  if (!occ) return 'free';
  if (occ.kind !== 'booking') return 'blocked';
  return caller && occ.userId === caller.id ? 'mine' : 'occupied';
}

function isBookable(input: GridInput, resource: Resource, slot: Interval): boolean {
  return (
    checkBookingRules({
      user: input.caller!,
      resource,
      slot,
      now: input.now,
      rules: input.rules,
      zone: input.zone,
      quota: input.quota,
      activeBookings: input.activeBookings,
    }) === null
  );
}
