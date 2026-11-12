/**
 * Example data shared by the dev seed and the unit tests.
 * IDs, names and values come from the `example:` fields in livrabil05/openapi.yaml where the spec has them.
 */
import type { WeeklyHours } from '../entities';
import type { ExternalAccess, Role } from '../enums';

export interface ExampleUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  sso_subject: string | null;
}

export interface ExampleSport {
  id: string;
  name_ro: string;
  name_en: string;
  icon: string;
  required_equipment: string[];
}

export interface ExampleResource {
  id: string;
  name: string;
  type: string;
  location: string;
  photo_url: string | null;
  capacity: number;
  equipment: string[];
  sport_ids: string[];
  opening_hours: WeeklyHours;
  slot_minutes: number;
  external_access: ExternalAccess;
  external_access_windows: WeeklyHours | null;
  active: boolean;
}

const WEEKDAY_HOURS = [{ open: '07:00', close: '22:00' }];
const SATURDAY_HOURS = [{ open: '09:00', close: '18:00' }];

/** The `WeeklyHours` example from the spec, extended to the whole working week. */
export const STANDARD_HOURS: WeeklyHours = {
  mon: WEEKDAY_HOURS,
  tue: WEEKDAY_HOURS,
  wed: WEEKDAY_HOURS,
  thu: WEEKDAY_HOURS,
  fri: WEEKDAY_HOURS,
  sat: SATURDAY_HOURS,
};

export const EXAMPLE_USERS = {
  student: {
    id: '3c7d1e94-52af-4b08-9e61-a8f02d6b7c15',
    full_name: 'Ion Popescu',
    email: 'ion.popescu@student.example.edu',
    phone: '+37360000000',
    role: 'student',
    sso_subject: 'seed:student',
  },
  teacher: {
    id: '8a1f3b27-6d4e-4c9a-b5f2-1e7d9c0a3b48',
    full_name: 'Maria Ionescu',
    email: 'maria.ionescu@example.edu',
    phone: null,
    role: 'teacher',
    sso_subject: 'seed:teacher',
  },
  admin: {
    id: 'b4e6c8d0-2f1a-4b3c-9d5e-7a8b9c0d1e2f',
    full_name: 'Andrei Rusu',
    email: 'andrei.rusu@example.edu',
    phone: null,
    role: 'admin',
    sso_subject: 'seed:admin',
  },
  external: {
    id: 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f',
    full_name: 'Ana Rusu',
    email: 'ana.rusu@example.com',
    phone: '+37360000001',
    role: 'external',
    sso_subject: null,
  },
} satisfies Record<string, ExampleUser>;

export const EXAMPLE_SPORTS = {
  basketball: {
    id: '5b1a8e02-6c7d-4f31-b2a9-0e4d7c9f1a26',
    name_ro: 'Baschet',
    name_en: 'Basketball',
    icon: 'basketball',
    required_equipment: ['panou'],
  },
  tennis: {
    id: '9c3d5e7f-1a2b-4c4d-8e6f-0a1b2c3d4e5f',
    name_ro: 'Tenis',
    name_en: 'Tennis',
    icon: 'tennis',
    required_equipment: ['fileu tenis'],
  },
  football: {
    id: '1d2e3f40-5a6b-4c7d-9e8f-a0b1c2d3e4f5',
    name_ro: 'Fotbal',
    name_en: 'Football',
    icon: 'football',
    required_equipment: ['porți fotbal'],
  },
  volleyball: {
    id: '6e7f8091-a2b3-4c4d-8e5f-6a7b8c9d0e1f',
    name_ro: 'Volei',
    name_en: 'Volleyball',
    icon: 'volleyball',
    required_equipment: ['fileu volei'],
  },
} satisfies Record<string, ExampleSport>;

export const EXAMPLE_RESOURCES = {
  basketballCourt: {
    id: '7d2f4c1e-3a5b-4e8f-9c10-2b6a1d3e5f70',
    name: 'Teren baschet 2',
    type: 'teren',
    location: '47.0245,28.8322',
    photo_url: 'https://campussport.example/media/teren-baschet-2.jpg',
    capacity: 10,
    equipment: ['panou', 'minge baschet', 'vestiar'],
    sport_ids: [EXAMPLE_SPORTS.basketball.id],
    opening_hours: STANDARD_HOURS,
    slot_minutes: 60,
    external_access: 'leftover',
    external_access_windows: null,
    active: true,
  },
  sportsHall: {
    id: '2c9e7a10-84b1-4f6d-a3c2-91de0f4b7a33',
    name: 'Sala polivalentă',
    type: 'sală',
    location: '47.0249,28.8317',
    photo_url: null,
    capacity: 30,
    equipment: ['panou', 'fileu volei', 'vestiar'],
    sport_ids: [EXAMPLE_SPORTS.basketball.id, EXAMPLE_SPORTS.volleyball.id],
    opening_hours: STANDARD_HOURS,
    slot_minutes: 90,
    external_access: 'window',
    external_access_windows: { sat: SATURDAY_HOURS },
    active: true,
  },
  tennisCourt: {
    id: '4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d',
    name: 'Teren tenis 1',
    type: 'teren',
    location: '47.0241,28.8329',
    photo_url: null,
    capacity: 4,
    equipment: ['fileu tenis', 'rachete'],
    sport_ids: [EXAMPLE_SPORTS.tennis.id],
    opening_hours: STANDARD_HOURS,
    slot_minutes: 60,
    external_access: 'leftover',
    external_access_windows: null,
    active: true,
  },
  /** Allowed for tennis by the admin, but without a net: GET /resources?sport=tennis must hide it (SRS 9.5). */
  tennisCourtNoNet: {
    id: '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
    name: 'Teren tenis 2 (fără fileu)',
    type: 'teren',
    location: '47.0240,28.8331',
    photo_url: null,
    capacity: 4,
    equipment: ['rachete'],
    sport_ids: [EXAMPLE_SPORTS.tennis.id],
    opening_hours: STANDARD_HOURS,
    slot_minutes: 60,
    external_access: 'never',
    external_access_windows: null,
    active: true,
  },
  footballPitch: {
    id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
    name: 'Teren fotbal',
    type: 'teren',
    location: '47.0252,28.8340',
    photo_url: null,
    capacity: 22,
    equipment: ['porți fotbal', 'vestiar'],
    sport_ids: [EXAMPLE_SPORTS.football.id],
    opening_hours: STANDARD_HOURS,
    slot_minutes: 90,
    external_access: 'leftover',
    external_access_windows: null,
    active: true,
  },
} satisfies Record<string, ExampleResource>;

/** The `Booking` example from the spec. */
export const EXAMPLE_BOOKING = {
  id: 'e3a94f60-1b2c-4d7e-8f05-6c2b9a0d4e11',
  resource_id: EXAMPLE_RESOURCES.basketballCourt.id,
  resource_name: 'Teren baschet 2',
  user_id: EXAMPLE_USERS.student.id,
  start: '2026-11-12T18:00:00+02:00',
  end: '2026-11-12T19:00:00+02:00',
  status: 'active',
  checked_in_at: null,
  participants_count: 8,
} as const;

/** The `BlockCreate` example from the spec (emergency, open-ended). */
export const EXAMPLE_BLOCK_CREATE = {
  resource_id: EXAMPLE_RESOURCES.sportsHall.id,
  kind: 'emergency',
  reason: 'Avarie',
  end: null,
} as const;
