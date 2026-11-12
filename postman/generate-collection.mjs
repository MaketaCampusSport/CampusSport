// Generates CampusSport.postman_collection.json from livrabil05/openapi.json.
// Run after changing the spec:  node postman/generate-collection.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, '..', 'livrabil05', 'openapi.json'), 'utf8'));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Path parameter -> collection variable, per path prefix. */
function pathVariable(path) {
  if (path.startsWith('/bookings/') || path.startsWith('/admin/bookings/')) return 'bookingId';
  if (path.startsWith('/admin/users/')) return 'userId';
  if (path.startsWith('/admin/sports/')) return 'sportId';
  if (path.startsWith('/resources/') || path.startsWith('/admin/resources/')) return 'resourceId';
  if (path.startsWith('/waitlist/')) return 'waitlistId';
  if (path.startsWith('/me/push-subscriptions/')) return 'pushSubscriptionId';
  if (path.startsWith('/admin/blocks/')) return 'blockId';
  if (path.startsWith('/admin/schedule/import/')) return 'importId';
  if (path.startsWith('/admin/schedule/recurrences/')) return 'recurrenceId';
  if (path.startsWith('/invitations/')) return 'invitationToken';
  if (path.startsWith('/calendar/')) return 'calendarToken';
  return 'id';
}

/** x-min-role -> which token variable to send. */
function tokenFor(op) {
  const role = op['x-min-role'];
  if (role === 'public' || op.operationId === 'refreshSession' || op.operationId === 'logout') return null;
  if (role === 'admin') return 'adminToken';
  if (role === 'student') return 'studentToken';
  return 'studentToken'; // utilizator, titular, titular / personal
}

const SETTINGS = {
  monthly_quota: 4,
  monthly_quota_per_sport: {},
  max_active_bookings: 2,
  booking_window_days_student: 7,
  booking_window_days_teacher: 14,
  booking_window_hours_external: 24,
  cancel_free_hours: 2,
  checkin_minutes_before: 10,
  checkin_minutes_after: 15,
  no_show_threshold: 3,
  no_show_suspension_days: 14,
  waitlist_offer_minutes: 10,
  waitlist_simultaneous_under_hours: 2,
  default_slot_minutes: 60,
  member_replaces_external: false,
};

/** Example bodies and queries, from the spec examples; {{...}} are collection/environment variables. */
const OVERRIDES = {
  ssoLogin: { query: { return_to: '/start' }, note: 'Redirects (302) to the identity provider; open it in a browser for the real flow.' },
  ssoCallback: { query: { code: 'from-identity-provider', state: 'from-sso-login' }, note: 'Normally called by the identity provider.' },
  verifyTwoFactor: { body: { challenge_id: '{{challengeId}}', code: '482913' }, note: 'challenge_id comes from the SSO callback redirect of an admin.' },
  registerExternal: { body: { full_name: 'Ana Rusu', email: 'ana.rusu@example.com', phone: '+37360000001' }, note: 'Needs Redis (OTP codes). The SMS code is printed in the API log in development.' },
  loginExternal: { body: { email: 'ana.rusu@example.com' } },
  verifyExternal: { body: { email: 'ana.rusu@example.com', email_code: '583021', phone_code: '190274' }, saveToken: 'externalToken' },
  refreshSession: { note: 'Uses the refresh_token cookie set by a login; Postman keeps cookies per domain.' },
  logout: { note: 'Uses the refresh_token cookie.' },
  deleteCurrentUser: {
    token: 'externalToken',
    guard: 'allowDelete',
    note: 'Deletes the caller (here: the external example user Ana Rusu). Skipped unless the variable allowDelete is "true". Restore the user with `npm run seed`.',
  },
  listUsers: { query: { q: 'popescu', role: 'student', page: '1', page_size: '20' } },
  suspendUser: { body: { until: '{{suspendUntil}}', reason: 'No-show-uri repetate' } },
  listResources: { query: { sport: '{{sportId}}' } },
  createSport: { body: { name_ro: 'Handbal', name_en: 'Handball', icon: 'handball', required_equipment: ['porți handbal'] }, save: { newSportId: 'id' } },
  updateSport: { body: { name_ro: 'Baschet', name_en: 'Basketball', icon: 'basketball', required_equipment: ['panou'] } },
  createResource: {
    body: {
      name: 'Teren baschet 3',
      type: 'teren',
      location: '47.0247,28.8325',
      capacity: 10,
      equipment: ['panou', 'minge baschet'],
      sport_ids: ['{{sportId}}'],
      opening_hours: { mon: [{ open: '07:00', close: '22:00' }], sat: [{ open: '09:00', close: '18:00' }] },
      slot_minutes: 60,
      external_access: 'leftover',
    },
    save: { newResourceId: 'id' },
  },
  updateResource: { body: { capacity: 12 } },
  getAvailability: { query: { resource: '{{resourceId}}', date: '{{date}}' }, note: 'Alternative: sport={{sportId}} instead of resource. Send with a token to see your own bookings and `bookable` for your role.' },
  streamAvailability: { query: { resource: '{{resourceId}}', date: '{{date}}' }, note: 'Server-Sent Events: Postman shows events as they arrive; stop the request to close it.' },
  createBooking: { body: { resource_id: '{{resourceId}}', start: '{{slotStart}}', participants_count: 8 }, save: { bookingId: 'id' } },
  checkInBooking: { body: { method: 'button' }, note: 'Only works from 10 min before to 15 min after the start; otherwise 422 CHECKIN_WINDOW_CLOSED. Staff (admin) send {"method":"qr","qr_token":"..."}.' },
  listMyBookings: { query: { scope: 'upcoming', page: '1', page_size: '20' } },
  listBookings: { query: { resource: '{{resourceId}}', date: '{{date}}' } },
  rescheduleBooking: { body: { start: '{{nextSlotStart}}', reason: 'Schimbare de program' } },
  adminCancelBooking: { body: { reason: 'Teren indisponibil' } },
  joinWaitlist: {
    token: 'teacherToken',
    body: { day: '{{date}}', resource_id: '{{resourceId}}', start: '{{slotStart}}', end: '{{slotEnd}}' },
    save: { waitlistId: 'id' },
    note: 'Sent as the teacher, for the slot the student booked with "Creează o rezervare".',
  },
  listMyWaitlist: { token: 'teacherToken' },
  leaveWaitlist: { token: 'teacherToken' },
  acceptWaitlistOffer: { token: 'teacherToken', note: 'Only after the worker offered the slot (status "offered"), e.g. once the student cancels.' },
  registerPushSubscription: {
    body: {
      endpoint: 'https://push.example.com/send/abc123',
      keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
    },
    save: { pushSubscriptionId: 'id' },
  },
  updateNotificationPreferences: { body: { push: true, email: true, sms: false, language: 'ro' } },
  listBlocks: { query: { resource: '{{hallId}}', kind: 'maintenance' } },
  createBlock: {
    body: { resource_id: '{{hallId}}', kind: 'maintenance', reason: 'Igienizare', start: '{{blockStart}}', end: '{{blockEnd}}' },
    save: { blockId: 'block.id' },
    note: 'Emergency "until further notice": {"resource_id": "...", "kind": "emergency", "reason": "Avarie", "end": null}.',
  },
  importSchedule: { formdata: { valid_from: '2027-02-01', valid_to: '2027-06-13', source_url: 'https://orar.example.edu/ef.ics' } },
  createScheduleClass: {
    body: {
      resource_id: '{{hallId}}',
      reason: 'Educație fizică, grupa TI-231',
      first_start: '2027-02-02T10:00:00+02:00',
      first_end: '2027-02-02T11:30:00+02:00',
      recurrence: { rule: 'FREQ=WEEKLY;BYDAY=TU', valid_from: '2027-02-01', valid_to: '2027-06-13' },
    },
  },
  createEvent: {
    body: { resource_id: '{{hallId}}', reason: 'Campionatul universitar de baschet', start: '2027-03-20T09:00:00+02:00', end: '2027-03-20T18:00:00+02:00', confirm_conflicts: false },
  },
  createAnnouncement: { body: { resource_id: '{{resourceId}}', message_ro: 'Vestiarele sunt închise astăzi până la ora 12:00.', message_en: 'The changing rooms are closed today until 12:00.' } },
  updateSettings: { body: SETTINGS },
  getDashboard: { query: { date: '{{date}}' } },
  getMonthlyReport: { query: { month: '2026-10', format: 'json' } },
  listAuditLog: { query: { entity: 'occupancy', page: '1' } },
};

/** Operations answering 501 in the current backend (see backend/README.md). */
const STUBS = new Set([
  'exportCurrentUserData', 'downloadBookingCalendar', 'createBookingInvitation', 'getInvitation', 'getCalendarFeed',
  'getCalendarFeedFile', 'listBookings', 'rescheduleBooking', 'adminCancelBooking', 'importSchedule',
  'confirmScheduleImport', 'createScheduleClass', 'deleteScheduleRecurrence', 'createEvent', 'createAnnouncement',
  'getDashboard', 'getMonthlyReport',
]);

function request(path, method, op) {
  const o = OVERRIDES[op.operationId] ?? {};
  const variable = pathVariable(path);
  const urlPath = path.replace(/\{[^}]+\}/g, `{{${variable}}}`);
  const query = Object.entries(o.query ?? {}).map(([key, value]) => ({ key, value }));
  const raw = `{{baseUrl}}${urlPath}${query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''}`;
  const token = o.token ?? tokenFor(op);

  const req = {
    method: method.toUpperCase(),
    header: [],
    url: { raw, host: ['{{baseUrl}}'], path: urlPath.split('/').filter(Boolean), ...(query.length ? { query } : {}) },
    description: [
      op.description ?? op.summary,
      '',
      `**Operation:** \`${op.operationId}\` · **Min role:** \`${op['x-min-role']}\` · **SRS:** ${(op['x-srs'] ?? []).join(', ')}`,
      STUBS.has(op.operationId) ? '\n**Not implemented yet:** the backend answers `501 NOT_IMPLEMENTED`.' : '',
      o.note ? `\n${o.note}` : '',
    ].join('\n'),
    auth: token ? { type: 'bearer', bearer: [{ key: 'token', value: `{{${token}}}`, type: 'string' }] } : { type: 'noauth' },
  };
  if (o.body) {
    req.header.push({ key: 'Content-Type', value: 'application/json' });
    req.body = { mode: 'raw', raw: JSON.stringify(o.body, null, 2), options: { raw: { language: 'json' } } };
  }
  if (o.formdata) {
    req.body = {
      mode: 'formdata',
      formdata: [
        ...Object.entries(o.formdata).map(([key, value]) => ({ key, value, type: 'text' })),
        { key: 'file', type: 'file', src: [], disabled: true, description: 'CSV (resource_id, weekday, start_time, end_time, group) or .ics' },
      ],
    };
  }

  const exec = STUBS.has(op.operationId)
    ? ["pm.test('not implemented yet: 501 (or an auth error)', () => pm.expect([501, 401, 403]).to.include(pm.response.code));"]
    : ["pm.test('no server error', () => pm.expect(pm.response.code).to.be.below(500));"];
  for (const [variableName, field] of Object.entries(o.save ?? {})) {
    exec.push(
      `if (pm.response.code < 300) { const v = ${field.split('.').reduce((acc, k) => `${acc}?.[${JSON.stringify(k)}]`, 'pm.response.json()')}; if (v) pm.collectionVariables.set('${variableName}', v); }`,
    );
  }
  if (o.saveToken) {
    exec.push(`if (pm.response.code === 200) pm.collectionVariables.set('${o.saveToken}', pm.response.json().access_token);`);
  }

  const event = [{ listen: 'test', script: { type: 'text/javascript', exec } }];
  if (o.guard) {
    event.unshift({
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [`if (pm.variables.get('${o.guard}') !== 'true') { console.log('Skipped: set ${o.guard}=true to run'); pm.execution.skipRequest(); }`],
      },
    });
  }
  const item = { name: op.summary, request: req, event };
  if (op.operationId === 'ssoLogin' || op.operationId === 'ssoCallback') item.protocolProfileBehavior = { followRedirects: false };
  return item;
}

const folders = new Map(spec.tags.map((t) => [t.name, { name: t.name, description: t.description, item: [] }]));
let count = 0;
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of METHODS) {
    const op = item[method];
    if (!op) continue;
    folders.get(op.tags[0]).item.push(request(path, method, op));
    count++;
  }
}

/** Collection-level script: future dates that fall on open weekdays, in the facility time zone. */
const prerequest = [
  "// Computes {{date}}, {{slotStart}}... two weekdays ahead, in Europe/Chisinau, unless set in the environment.",
  "const zone = 'Europe/Chisinau';",
  "function offsetOf(d) {",
  "  try {",
  "    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(d);",
  "    const name = parts.find((p) => p.type === 'timeZoneName').value;",
  "    return name === 'GMT' ? '+00:00' : name.replace('GMT', '');",
  "  } catch (e) { return '+02:00'; }",
  "}",
  "const day = new Date(Date.now() + 2 * 86400000);",
  "while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);",
  "const ymd = day.toISOString().slice(0, 10);",
  "const off = offsetOf(day);",
  "const at = (h) => `${ymd}T${String(h).padStart(2, '0')}:00:00${off}`;",
  "const set = (k, v) => { if (!pm.environment.get(k)) pm.collectionVariables.set(k, v); };",
  "set('date', ymd);",
  "set('slotStart', at(18));",
  "set('slotEnd', at(19));",
  "set('nextSlotStart', at(19));",
  "set('blockStart', at(7));",
  "set('blockEnd', at(10));",
  "set('suspendUntil', new Date(Date.now() + 14 * 86400000).toISOString());",
];

const variable = [
  ['baseUrl', 'http://localhost:3000/api/v1'],
  ['resourceId', '7d2f4c1e-3a5b-4e8f-9c10-2b6a1d3e5f70', 'Teren baschet 2 (seed)'],
  ['hallId', '2c9e7a10-84b1-4f6d-a3c2-91de0f4b7a33', 'Sala polivalentă (seed)'],
  ['sportId', '5b1a8e02-6c7d-4f31-b2a9-0e4d7c9f1a26', 'Baschet (seed)'],
  ['userId', '3c7d1e94-52af-4b08-9e61-a8f02d6b7c15', 'Ion Popescu, student (seed)'],
  ['bookingId', '', 'Set by "Creează o rezervare"'],
  ['waitlistId', '', 'Set by "Înscriere pe slot..."'],
  ['blockId', '', 'Set by "Blocare de urgență sau planificată"'],
  ['pushSubscriptionId', '', 'Set by "Înregistrează dispozitivul..."'],
  ['challengeId', ''],
  ['allowDelete', 'false', 'Set to "true" to really run DELETE /me'],
  ['importId', '00000000-0000-4000-8000-000000000000'],
  ['recurrenceId', '00000000-0000-4000-8000-000000000000'],
  ['invitationToken', '9fK2xQ'],
  ['calendarToken', 'b81f0c7e'],
].map(([key, value, description]) => ({ key, value, ...(description ? { description } : {}) }));

const collection = {
  info: {
    name: 'CampusSport API',
    description: [
      `All ${count} operations of livrabil05/openapi.yaml, grouped by tag. Generated by postman/generate-collection.mjs.`,
      '',
      '1. Start the backend (see INSTALL.md).',
      '2. `cd backend && npm run dev:token -- --postman`, then import `postman/CampusSport-local.postman_environment.json` and select it.',
      '3. Run the requests in a folder top to bottom: created ids (booking, waitlist, block) are stored in collection variables.',
      '',
      'Requests marked "Not implemented yet" answer 501 in the current backend.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'noauth' },
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: prerequest } }],
  variable,
  item: [...folders.values()],
};

writeFileSync(join(here, 'CampusSport.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
console.log(`Wrote ${count} requests in ${folders.size} folders`);
