/**
 * Tipurile schimbate cu serverul (SDD cap. 5–6). Când backend-ul publică OpenAPI,
 * aceste tipuri se înlocuiesc cu cele generate (`npm run api:generate`) – vezi openapi/README.md.
 */

export type Channel = 'push' | 'email' | 'sms';
export type ExternalAccess = 'never' | 'window' | 'leftover';
/** 1 = luni … 7 = duminică (ISO 8601). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/* ───────────── Autentificare ───────────── */

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: 'admin';
}

export interface SessionInfo {
  user: AdminUser;
  /** Al doilea pas (TOTP) obligatoriu pentru administratori – NFR-08. */
  twoFactorVerified: boolean;
  /** Sesiunea de administrare expiră după 8 ore – NFR-08. */
  expiresAt: string;
}

/* ───────────── Catalog ───────────── */

export interface Sport {
  id: string;
  nameRo: string;
  nameEn: string;
  /** Dotările fără de care resursa nu poate găzdui sportul (FR-07). */
  requiredEquipment: string[];
}

export interface ExternalWindow {
  days: IsoWeekday[];
  from: string; // HH:mm
  to: string; // HH:mm
}

export interface Resource {
  id: string;
  name: string;
  location: string;
  photoUrl: string;
  capacity: number;
  equipment: string[];
  sportIds: string[];
  opensAt: string; // HH:mm
  closesAt: string; // HH:mm
  slotMinutes: number;
  externalAccess: ExternalAccess;
  externalWindow: ExternalWindow | null;
  active: boolean;
  /** Calculat de server: resursa se află acum sub o blocare. */
  blocked: boolean;
  blockedLabel: string | null;
}

export type ResourceInput = Omit<Resource, 'id' | 'photoUrl' | 'blocked' | 'blockedLabel'>;

/* ───────────── Panoul zilei ───────────── */

export type CellState = 'free' | 'booked' | 'pe_class' | 'event' | 'blocked' | 'closed';

export interface DashboardCell {
  hour: number;
  state: CellState;
  /** Titularul rezervării / cursul / evenimentul / motivul blocării (vizibil doar pentru admin). */
  label?: string;
}

export interface DashboardRow {
  resourceId: string;
  name: string;
  photoUrl: string;
  blocked: boolean;
  blockedLabel: string | null;
  cells: DashboardCell[];
}

export interface Kpi {
  value: number;
  /** Variație procentuală față de perioada anterioară. */
  deltaPct?: number;
}

export interface ActiveEmergency {
  blockId: string;
  resourceId: string;
  resourceName: string;
  reason: string;
  startedAt: string;
  affectedCount: number;
}

export interface DashboardData {
  date: string; // yyyy-MM-dd
  hours: number[];
  kpis: {
    bookings: Kpi;
    checkIns: Kpi;
    noShows: Kpi;
    occupancyPct: Kpi;
  };
  rows: DashboardRow[];
  activeEmergencies: ActiveEmergency[];
}

/* ───────────── Blocări ───────────── */

export type BlockKind = 'emergency' | 'maintenance' | 'cleaning';
export type BlockRecurrence = 'none' | 'daily' | 'weekly';
export type BlockStatus = 'active' | 'planned' | 'history';

export interface Block {
  id: string;
  resourceId: string;
  resourceName: string;
  resourcePhotoUrl: string;
  kind: BlockKind;
  reason: string;
  startsAt: string;
  /** `null` = „până la noi ordine”. */
  endsAt: string | null;
  recurrence: BlockRecurrence;
  affectedCount: number;
  status: BlockStatus;
  createdBy: string;
  hasDelivery: boolean;
  releasedAt: string | null;
}

export interface BlockList {
  items: Block[];
  counts: Record<BlockStatus, number>;
}

export interface BlockInput {
  resourceId: string;
  kind: BlockKind;
  reason: string;
  startsAt: string;
  endsAt: string | null;
  recurrence: BlockRecurrence;
  channels: Channel[];
}

export interface BlockPreviewQuery {
  resourceId: string;
  from: string;
  to: string | null;
  /** La editare: blocarea curentă nu se numără ca „existentă”. */
  excludeBlockId?: string;
}

export interface BlockPreview {
  affectedCount: number;
}

export interface DeliveryReport {
  blockId: string;
  resourceName: string;
  startedAt: string;
  total: number;
  cancelled: number;
  quotasRefunded: number;
  /** Mesaje trimise până acum (SDD 7.3, pasul 4: „anunțați / livrați”). */
  delivered: number;
  push: number;
  email: number;
  sms: number;
  complete: boolean;
  durationSeconds: number;
}

/* ───────────── Orar EF ───────────── */

export type UserKind = 'student' | 'teacher' | 'external';

export interface ScheduleConflict {
  bookingId: string;
  userName: string;
  userKind: UserKind;
  resourceName: string;
  startsAt: string;
  courseName: string;
}

export interface SchedulePreview {
  importId: string;
  source: { kind: 'file' | 'manual'; name: string };
  recurringClasses: number;
  weeks: number;
  blocksGenerated: number;
  conflictCount: number;
  conflicts: ScheduleConflict[];
}

export interface ScheduleResult {
  importId: string;
  blocksCreated: number;
  cancelledBookings: number;
  notifiedUsers: number;
}

export interface ManualClassInput {
  resourceId: string;
  courseName: string;
  weekdays: IsoWeekday[];
  from: string;
  to: string;
  validFrom: string; // yyyy-MM-dd
  validTo: string; // yyyy-MM-dd
}

/* ───────────── Evenimente ───────────── */

export type EventRecurrence = 'none' | 'weekly' | 'monthly';

export interface UniEvent {
  id: string;
  name: string;
  resourceIds: string[];
  resourceNames: string[];
  photoUrl: string;
  startsAt: string;
  endsAt: string;
  recurrence: EventRecurrence;
  cancelledCount: number;
}

export interface EventInput {
  name: string;
  resourceIds: string[];
  date: string; // yyyy-MM-dd
  from: string; // HH:mm
  to: string; // HH:mm
  recurrence: EventRecurrence;
}

export interface EventPreview {
  conflictCount: number;
}

/* ───────────── Anunțuri ───────────── */

export type AnnouncementCategory = 'urgent' | 'general' | 'maintenance';
export type AudienceKind = 'all_with_bookings' | 'resource' | 'interval' | 'waitlist';

export interface AudienceQuery {
  audience: AudienceKind;
  resourceId: string | null;
  date: string | null; // yyyy-MM-dd
  allDay: boolean;
  from: string | null;
  to: string | null;
}

export interface AnnouncementInput extends AudienceQuery {
  category: AnnouncementCategory;
  title: string;
  message: string;
  channels: Channel[];
}

export interface Announcement {
  id: string;
  category: AnnouncementCategory;
  title: string;
  message: string;
  recipients: number;
  deliveredPct: number;
  sentAt: string;
}

export interface AudienceEstimate {
  count: number;
}

/* ───────────── Rapoarte ───────────── */

export interface ReportData {
  month: string; // yyyy-MM
  previousMonth: string;
  kpis: {
    occupancy: Kpi;
    bookings: Kpi;
    noShowRate: Kpi;
    members: number;
    external: number;
    studentsAtLimit: Kpi;
  };
  hourly: { hour: number; pct: number }[];
  perResource: { resourceId: string; name: string; photoUrl: string; pct: number }[];
}

export type ExportFormat = 'csv' | 'pdf';

/* ───────────── Reguli ───────────── */

/** Valorile BR-01 … BR-07 (SRS 9.2), configurabile de administrator (FR-46). */
export interface RuleSettings {
  quotaMonthly: number; // BR-01
  maxActiveFuture: number; // BR-02
  quotaPerSport: boolean;
  windowTeacherDays: number; // BR-03
  windowStudentDays: number; // BR-03
  windowExternalHours: number; // BR-03
  cancelBeforeHours: number; // BR-04
  checkinBeforeMin: number; // BR-05
  checkinAfterMin: number; // BR-05
  noShowLimit: number; // BR-06
  suspensionDays: number; // BR-06
  waitlistOfferMinutes: number; // BR-07
}

/* ───────────── Jurnal audit ───────────── */

export type AuditAction =
  | 'emergency_block'
  | 'planned_block'
  | 'block_updated'
  | 'unblock'
  | 'announcement_sent'
  | 'schedule_import'
  | 'rule_changed'
  | 'account_suspended'
  | 'resource_created'
  | 'resource_updated'
  | 'resource_deactivated'
  | 'resource_activated'
  | 'event_created'
  | 'sport_created'
  | 'sport_updated'
  | 'sport_deleted'
  | 'account_reactivated'
  | 'twofa_enabled';

export type AuditPeriod = '24h' | '7d' | '30d' | '12m';

export interface AuditEntry {
  id: string;
  at: string;
  actor: { id: string; name: string };
  action: AuditAction;
  object: string;
}

export interface AuditQuery {
  q?: string;
  actorId?: string;
  period: AuditPeriod;
  page: number;
  pageSize: number;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  actors: { id: string; name: string }[];
}
/* ───────────── Sporturi (admin, NFR-14) ───────────── */

export type SportInput = Omit<Sport, 'id'>;

/* ───────────── Utilizatori (admin, FR-05) ───────────── */

export type AccountStatus = 'active' | 'suspended';

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserKind;
  status: AccountStatus;
  suspendedUntil: string | null;
  noShowsThisMonth: number;
}

export interface UserQuery {
  q?: string;
  role?: UserKind | '';
  status?: AccountStatus | '';
}

export interface SuspendInput {
  days: number;
  reason: string;
}

/* ───────────── Check-in personal (FR-03 / FR-15) ───────────── */

export interface CheckInResult {
  bookingId: string;
  userName: string;
  userKind: UserKind;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  outcome: 'ok' | 'already_checked_in';
}

/* ───────────── Cont administrator / 2FA (NFR-08) ───────────── */

export interface TotpSetup {
  secret: string;
  otpauthUrl: string;
}