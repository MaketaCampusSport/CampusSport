import { AuditLog } from './audit-log.entity';
import { MonthlyQuota } from './monthly-quota.entity';
import { Notification } from './notification.entity';
import { Occupancy } from './occupancy.entity';
import { PushSubscription } from './push-subscription.entity';
import { Recurrence } from './recurrence.entity';
import { Resource } from './resource.entity';
import { Setting } from './setting.entity';
import { Sport } from './sport.entity';
import { User } from './user.entity';
import { WaitlistEntry } from './waitlist-entry.entity';

export {
  AuditLog,
  MonthlyQuota,
  Notification,
  Occupancy,
  PushSubscription,
  Recurrence,
  Resource,
  Setting,
  Sport,
  User,
  WaitlistEntry,
};
export type { NotificationPreferencesValue } from './user.entity';
export { WEEKDAYS } from './resource.entity';
export type { TimeOfDayRange, Weekday, WeeklyHours } from './resource.entity';

/** Entities for the 12 tables; resource_sports is the join table of Resource.sports. */
export const ENTITIES = [
  AuditLog,
  MonthlyQuota,
  Notification,
  Occupancy,
  PushSubscription,
  Recurrence,
  Resource,
  Setting,
  Sport,
  User,
  WaitlistEntry,
];
