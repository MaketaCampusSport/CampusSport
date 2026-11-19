import { API_BASE, USE_MOCKS } from './config';
import { http } from './http';
import type {
  AdminUser,
  Announcement,
  AnnouncementInput,
  AudienceEstimate,
  AudienceQuery,
  AuditPage,
  AuditQuery,
  Block,
  BlockInput,
  BlockList,
  BlockPreview,
  BlockPreviewQuery,
  CheckInResult,
  DashboardData,
  DeliveryReport,
  EventInput,
  EventPreview,
  ExportFormat,
  ManagedUser,
  ManualClassInput,
  ReportData,
  Resource,
  ResourceInput,
  RuleSettings,
  SchedulePreview,
  ScheduleResult,
  SessionInfo,
  Sport,
  SportInput,
  SuspendInput,
  TotpSetup,
  UniEvent,
  UserQuery,
} from './types';



/**
 * Stratul de acces la API. Rutele marcate „SDD 6.1” sunt cele documentate;
 * cele marcate „presupus” trebuie confirmate cu echipa de backend
 * (lista completă: docs/API-ASSUMPTIONS.md).
 */
export const api = {
  auth: {
    /** presupus: starea sesiunii curente (401 dacă nu există sesiune SSO). */
    me: () => http.get<SessionInfo>('/me'),
    /**
     * SDD 6.1: GET /auth/sso/login redirecționează către SSO-ul universității.
     * În modul demo simulăm întoarcerea din SSO fără redirecționare.
     */
    async startSso(): Promise<'redirected' | 'mock'> {
      if (USE_MOCKS) {
        await http.post('/auth/sso/login');
        return 'mock';
      }
      window.location.assign(
        `${API_BASE}/auth/sso/login?audience=admin&redirect=${encodeURIComponent('/admin')}`,
      );
      return 'redirected';
    },
    /** presupus: al doilea pas TOTP pentru administratori (NFR-08). */
    verifyTotp: (code: string) => http.post<SessionInfo>('/auth/admin/totp', { code }),
    /** presupus */
    logout: () => http.post<void>('/auth/logout'),
  },

  catalog: {
    /** SDD 6.1: GET /sports */
    sports: () => http.get<Sport[]>('/sports'),
    /** presupus: listă completă, inclusiv resursele dezactivate. */
    resources: () => http.get<Resource[]>('/admin/resources'),
  },

  resources: {
    /** presupus (FR-39) */
    create: (input: ResourceInput) => http.post<Resource>('/admin/resources', input),
    /** presupus (FR-39) */
    update: (id: string, input: ResourceInput) => http.patch<Resource>(`/admin/resources/${id}`, input),
    /** presupus (FR-39): dezactivare / reactivare. */
    setActive: (id: string, active: boolean) =>
      http.patch<Resource>(`/admin/resources/${id}`, { active }),
  },

  dashboard: {
    /** presupus (FR-43): ziua curentă pe toate resursele + indicatori. */
    get: (date: string) => http.get<DashboardData>('/admin/dashboard', { date }),
  },

  blocks: {
    /** presupus */
    list: () => http.get<BlockList>('/admin/blocks'),
    /** presupus: câte rezervări ar fi afectate (FR-41). */
    preview: (q: BlockPreviewQuery) =>
      http.get<BlockPreview>('/admin/blocks/preview', {
        resourceId: q.resourceId,
        from: q.from,
        to: q.to,
        excludeBlockId: q.excludeBlockId,
      }),
    /** SDD 6.1: POST /admin/blocks – blocare de urgență sau planificată. */
    create: (input: BlockInput) => http.post<Block>('/admin/blocks', input),
    /** presupus: editarea unei blocări planificate. */
    update: (id: string, input: BlockInput) => http.patch<Block>(`/admin/blocks/${id}`, input),
    /** presupus: deblocare (încheie blocarea acum). */
    release: (id: string) => http.delete<Block>(`/admin/blocks/${id}`),
    /** presupus: raportul „anunțați / livrați” (SDD 7.3). */
    delivery: (id: string) => http.get<DeliveryReport>(`/admin/blocks/${id}/delivery`),
  },

  schedule: {
    /** presupus: validează fișierul și calculează conflictele, fără să scrie (SDD 7.4). */
    previewFile(file: File): Promise<SchedulePreview> {
      const form = new FormData();
      form.append('file', file);
      return http.upload<SchedulePreview>('/admin/schedule/import/preview', form);
    },
    /** presupus: „Adaugă manual” – același flux de previzualizare. */
    previewManual: (input: ManualClassInput) =>
      http.post<SchedulePreview>('/admin/schedule/classes/preview', input),
    /** SDD 6.1: POST /admin/schedule/import – confirmă importul pregătit anterior. */
    commit: (importId: string) => http.post<ScheduleResult>('/admin/schedule/import', { importId }),
  },

  events: {
    /** presupus */
    list: () => http.get<UniEvent[]>('/admin/events'),
    /** presupus: conflictele noului eveniment, înainte de confirmare. */
    preview: (input: EventInput) => http.post<EventPreview>('/admin/events/preview', input),
    /** SDD 6.1: POST /admin/events */
    create: (input: EventInput) => http.post<UniEvent>('/admin/events', input),
  },

  announcements: {
    /** presupus */
    list: () => http.get<Announcement[]>('/admin/announcements'),
    /** presupus: „Ajunge la N utilizatori”. */
    audience: (q: AudienceQuery) =>
      http.get<AudienceEstimate>('/admin/announcements/audience', {
        audience: q.audience,
        resourceId: q.resourceId,
        date: q.date,
        allDay: q.allDay,
        from: q.from,
        to: q.to,
      }),
    /** SDD 6.1: POST /admin/announcements */
    send: (input: AnnouncementInput) => http.post<Announcement>('/admin/announcements', input),
  },

  reports: {
    /** SDD 6.1: GET /admin/reports?month= */
    get: (month: string) => http.get<ReportData>('/admin/reports', { month }),
    /** SDD 6.1: export CSV/PDF – parametrul `format` este presupus. */
    export: (month: string, format: ExportFormat) => http.blob('/admin/reports', { month, format }),
  },

  settings: {
    /** SDD 6.1: GET/PUT /admin/settings. Contractul este `RuleSettings` (camelCase) – vezi docs/API-ASSUMPTIONS.md. */
    get: () => http.get<RuleSettings>('/admin/settings'),
    update: (settings: RuleSettings) => http.put<RuleSettings>('/admin/settings', settings),
  },

  audit: {
    /** presupus (FR-45) */
    list: (q: AuditQuery) =>
      http.get<AuditPage>('/admin/audit', {
        q: q.q,
        actorId: q.actorId,
        period: q.period,
        page: q.page,
        pageSize: q.pageSize,
      }),
    exportCsv: (q: Omit<AuditQuery, 'page' | 'pageSize'>) =>
      http.blob('/admin/audit', { q: q.q, actorId: q.actorId, period: q.period, format: 'csv' }),
  },
  sports: {
    /** presupus (NFR-14) */
    create: (input: SportInput) => http.post<Sport>('/admin/sports', input),
    update: (id: string, input: SportInput) => http.patch<Sport>(`/admin/sports/${id}`, input),
    /** 409 dacă o resursă folosește sportul. */
    remove: (id: string) => http.delete<void>(`/admin/sports/${id}`),
  },

  users: {
    /** presupus (FR-05) */
    list: (q: UserQuery) => http.get<ManagedUser[]>('/admin/users', { q: q.q, role: q.role, status: q.status }),
    suspend: (id: string, input: SuspendInput) => http.post<ManagedUser>(`/admin/users/${id}/suspend`, input),
    reactivate: (id: string) => http.post<ManagedUser>(`/admin/users/${id}/reactivate`),
  },

  checkin: {
    /** presupus (FR-03/FR-15): `code` = conținutul QR scanat sau codul introdus manual. */
    verify: (code: string) => http.post<CheckInResult>('/admin/check-in', { code }),
  },

  account: {
    /** presupus (NFR-08): configurarea TOTP pentru administrator. */
    totpSetup: () => http.post<TotpSetup>('/admin/2fa/setup'),
    totpConfirm: (code: string) => http.post<void>('/admin/2fa/confirm', { code }),
  },
};

export type { AdminUser };