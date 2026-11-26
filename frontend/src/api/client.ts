/**
 * Clientul API, aliniat la contractul serverului (assets/livrabil05/openapi.yaml).
 * Tipurile vin din `./generated` (npm run api:generate); JSON-ul este snake_case, ca în specificație.
 * Rutele `/auth/dev/*` există doar în dezvoltare (backend: DevAuthController) și nu fac parte din contract.
 */
import { API_BASE } from './config';
import type {
  AcceptWaitlistOfferResponses,
  AnnouncementCreate,
  Availability,
  Block,
  BlockCreate,
  BlockResult,
  Booking,
  BookingCreate,
  CancellationResult,
  CheckInRequest,
  CheckInResult,
  Dashboard,
  DeliveryStatus,
  EventCreate,
  GetAvailabilityData,
  GetMonthlyReportData,
  ListAuditLogData,
  ListAuditLogResponses,
  ListBlocksData,
  ListBlocksResponses,
  ListBookingsData,
  ListMyBookingsData,
  ListMyBookingsResponses,
  ListResourcesData,
  ListUsersData,
  ListUsersResponses,
  MonthlyReport,
  NotificationPreferences,
  PasswordLogin,
  PasswordRegistration,
  Quota,
  Resource,
  ResourceInput,
  ScheduleClassCreate,
  ScheduleImportPreview,
  ScheduleImportResult,
  Session,
  Settings,
  SettingsWritable,
  Sport,
  SportInput,
  User,
  UserCreate,
  UserUpdate,
  WaitlistEntry,
  WaitlistJoin,
} from './generated';
import { http } from './http';

export type * from './generated';

export type Page<T> = { page: number; page_size: number; total: number; items: T[] };
export type BookingPage = ListMyBookingsResponses[200];
export type UserPage = ListUsersResponses[200];
export type AuditLogPage = ListAuditLogResponses[200];
export type BlockPage = ListBlocksResponses[200];

/** Utilizator din lista de autentificare de dezvoltare. */
export interface DevLoginUser {
  email: string;
  full_name: string;
  role: User['role'];
}

const enc = encodeURIComponent;

/** Corpul `AvatarUpload`: un singur câmp `file`. */
function imageForm(image: Blob): FormData {
  const form = new FormData();
  form.append('file', image, image instanceof File ? image.name : 'avatar');
  return form;
}

export const client = {
  auth: {
    /** POST /auth/register: cont nou de student sau profesor; răspunsul deschide direct sesiunea. */
    register: (input: PasswordRegistration) => http.post<Session>('/auth/register', input),
    /** POST /auth/login: email și parolă, pentru toate rolurile (inclusiv administratori). */
    login: (input: PasswordLogin) => http.post<Session>('/auth/login', input),
    // DEZACTIVAT (autentificare cu email și parolă): SSO, 2FA pentru administratori și OTP pentru externi.
    // /** GET /auth/sso/login: navigare completă (302 către SSO); revenirea e la `return_to` sau la /auth/2fa. */
    // ssoLoginUrl: (returnTo: string) => `${API_BASE}/auth/sso/login?return_to=${enc(returnTo)}`,
    // verifyTwoFactor: (challengeId: string, code: string) =>
    //   http.post<Session>('/auth/2fa/verify', { challenge_id: challengeId, code }),
    // registerExternal: (input: ExternalRegistration) => http.post<OtpSent>('/auth/external/register', input),
    // loginExternal: (email: string) => http.post<OtpSent>('/auth/external/login', { email }),
    // verifyExternal: (input: { email: string; email_code: string; phone_code?: string }) =>
    //   http.post<Session>('/auth/external/verify', input),
    logout: () => http.post<void>('/auth/logout'),
    devUsers: () => http.get<DevLoginUser[]>('/auth/dev/users'),
    devLogin: (email: string) => http.post<Session>('/auth/dev/login', { email }),
  },

  me: {
    get: () => http.get<User>('/me'),
    remove: () => http.delete<void>('/me'),
    /** POST /me/avatar (multipart, câmpul `file`). */
    uploadAvatar: (image: Blob) => http.upload<User>('/me/avatar', imageForm(image)),
    deleteAvatar: () => http.delete<User>('/me/avatar'),
    quota: () => http.get<Quota>('/me/quota'),
    bookings: (q: ListMyBookingsData['query'] = {}) => http.get<BookingPage>('/me/bookings', q),
    waitlist: () => http.get<WaitlistEntry[]>('/me/waitlist'),
    notificationPreferences: () => http.get<NotificationPreferences>('/me/notification-preferences'),
    updateNotificationPreferences: (prefs: NotificationPreferences) =>
      http.put<NotificationPreferences>('/me/notification-preferences', prefs),
  },

  catalog: {
    sports: (signal?: AbortSignal) => http.get<Sport[]>('/sports', undefined, signal),
    resources: (q: ListResourcesData['query'] = {}, signal?: AbortSignal) =>
      http.get<Resource[]>('/resources', q, signal),
    resource: (id: string, signal?: AbortSignal) => http.get<Resource>(`/resources/${enc(id)}`, undefined, signal),
  },

  availability: {
    get: (q: GetAvailabilityData['query'], signal?: AbortSignal) => http.get<Availability>('/availability', q, signal),
    /** SSE public (`event: slot-changed`), folosit cu EventSource. */
    streamUrl: (resourceId: string, date: string) =>
      `${API_BASE}/stream/availability?resource=${enc(resourceId)}&date=${enc(date)}`,
  },

  bookings: {
    create: (input: BookingCreate) => http.post<Booking>('/bookings', input),
    get: (id: string) => http.get<Booking>(`/bookings/${enc(id)}`),
    cancel: (id: string) => http.delete<CancellationResult>(`/bookings/${enc(id)}`),
    checkIn: (id: string, input: CheckInRequest) => http.post<CheckInResult>(`/bookings/${enc(id)}/check-in`, input),
    calendar: (id: string) => http.blob(`/bookings/${enc(id)}/calendar.ics`),
  },

  waitlist: {
    join: (input: WaitlistJoin) => http.post<WaitlistEntry>('/waitlist', input),
    leave: (id: string) => http.delete<void>(`/waitlist/${enc(id)}`),
    accept: (id: string) => http.post<AcceptWaitlistOfferResponses[201]>(`/waitlist/${enc(id)}/accept`),
  },

  admin: {
    users: (q: ListUsersData['query'] = {}) => http.get<UserPage>('/admin/users', q),
    suspendUser: (id: string, input: { until: string; reason: string }) =>
      http.post<User>(`/admin/users/${enc(id)}/suspend`, input),
    reactivateUser: (id: string) => http.post<User>(`/admin/users/${enc(id)}/reactivate`),
    createUser: (input: UserCreate) => http.post<User>('/admin/users', input),
    updateUser: (id: string, input: UserUpdate) => http.patch<User>(`/admin/users/${enc(id)}`, input),
    deleteUser: (id: string) => http.delete<void>(`/admin/users/${enc(id)}`),
    uploadUserAvatar: (id: string, image: Blob) => http.upload<User>(`/admin/users/${enc(id)}/avatar`, imageForm(image)),
    deleteUserAvatar: (id: string) => http.delete<User>(`/admin/users/${enc(id)}/avatar`),

    createSport: (input: SportInput) => http.post<Sport>('/admin/sports', input),
    updateSport: (id: string, input: SportInput) => http.put<Sport>(`/admin/sports/${enc(id)}`, input),
    createResource: (input: ResourceInput) => http.post<Resource>('/admin/resources', input),
    updateResource: (id: string, input: ResourceInput) => http.patch<Resource>(`/admin/resources/${enc(id)}`, input),

    bookings: (q: ListBookingsData['query'] = {}) => http.get<BookingPage>('/admin/bookings', q),
    cancelBooking: (id: string, reason: string) =>
      http.post<CancellationResult>(`/admin/bookings/${enc(id)}/cancel`, { reason }),

    blocks: (q: ListBlocksData['query'] = {}) => http.get<BlockPage>('/admin/blocks', q),
    createBlock: (input: BlockCreate) => http.post<BlockResult>('/admin/blocks', input),
    deleteBlock: (id: string) => http.delete<void>(`/admin/blocks/${enc(id)}`),
    blockDelivery: (id: string) => http.get<DeliveryStatus>(`/admin/blocks/${enc(id)}/delivery`),

    /** Încă 501 pe server (backend/README.md). */
    importSchedule: (form: FormData) => http.upload<ScheduleImportPreview>('/admin/schedule/import', form),
    confirmScheduleImport: (id: string) =>
      http.post<ScheduleImportResult>(`/admin/schedule/import/${enc(id)}/confirm`),
    createScheduleClass: (input: ScheduleClassCreate) =>
      http.post<ScheduleImportResult>('/admin/schedule/classes', input),
    createEvent: (input: EventCreate) => http.post<BlockResult>('/admin/events', input),

    announce: (input: AnnouncementCreate) => http.post<{ recipients_count: number }>('/admin/announcements', input),

    settings: () => http.get<Settings>('/admin/settings'),
    updateSettings: (input: SettingsWritable) => http.put<Settings>('/admin/settings', input),
    dashboard: (date?: string) => http.get<Dashboard>('/admin/dashboard', { date }),
    report: (month: string) => http.get<MonthlyReport>('/admin/reports', { month }),
    reportFile: (month: string, format: Exclude<GetMonthlyReportData['query']['format'], 'json' | undefined>) =>
      http.blob('/admin/reports', { month, format }),
    auditLog: (q: ListAuditLogData['query'] = {}) => http.get<AuditLogPage>('/admin/audit-log', q),
  },
};

export type { Block, Booking };
