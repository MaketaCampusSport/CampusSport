export type SlotStatus = 'free' | 'occupied' | 'my_booking' | 'pe_class';

export interface TimeSlotItem {
  id: string;
  time: string; // e.g. "16:00"
  endTime: string; // e.g. "17:00"
  status: SlotStatus;
}

export interface SportResource {
  id: string;
  sportId: string;
  name: string;
  location: string;
  environment: 'Interior' | 'Exterior';
  surfaceOrDetails: string;
  slotsByDay: Record<string, TimeSlotItem[]>;
}

export interface DayOption {
  id: string;
  dayShort: string;
  dayNumber: string;
  fullLabel: string; // e.g. "Joi, 24 oct"
}

export interface SelectedSlotSummary {
  sportId: string;
  sportName: string;
  resourceId: string;
  resourceName: string;
  location: string;
  dayId: string;
  dayLabel: string;
  slotId: string;
  time: string;
  endTime: string;
}

export const SPORT_LABELS: Record<string, string> = {
  fotbal: 'Fotbal',
  baschet: 'Baschet',
  tenis: 'Tenis',
  volei: 'Volei',
  fitness: 'Fitness',
  inot: 'Înot',
};

export const AVAILABLE_DAYS: DayOption[] = [
  { id: '2026-10-24', dayShort: 'JOI', dayNumber: '24', fullLabel: 'Joi, 24 oct' },
  { id: '2026-10-25', dayShort: 'VIN', dayNumber: '25', fullLabel: 'Vin, 25 oct' },
  { id: '2026-10-26', dayShort: 'SÂM', dayNumber: '26', fullLabel: 'Sâm, 26 oct' },
  { id: '2026-10-27', dayShort: 'DUM', dayNumber: '27', fullLabel: 'Dum, 27 oct' },
  { id: '2026-10-28', dayShort: 'LUN', dayNumber: '28', fullLabel: 'Lun, 28 oct' },
  { id: '2026-10-29', dayShort: 'MAR', dayNumber: '29', fullLabel: 'Mar, 29 oct' },
  { id: '2026-10-30', dayShort: 'MIE', dayNumber: '30', fullLabel: 'Mie, 30 oct' },
];

const buildStandardSchedule = (
  prefix: string,
  overrides: Record<string, SlotStatus> = {}
): TimeSlotItem[] => {
  const hours = [
    ['16:00', '17:00'],
    ['17:00', '18:00'],
    ['18:00', '19:00'],
    ['19:00', '20:00'],
    ['20:00', '21:00'],
    ['21:00', '22:00'],
    ['10:00', '11:00'],
    ['11:00', '12:00'],
    ['12:00', '13:00'],
    ['14:00', '15:00'],
  ];

  return hours.map(([time, endTime]) => ({
    id: `${prefix}-${time}`,
    time,
    endTime,
    status: overrides[time] ?? 'free',
  }));
};

export const SPORT_RESOURCES: SportResource[] = [
  // Baschet (matches UI Design page 17)
  {
    id: 'res-teren-2',
    sportId: 'baschet',
    name: 'Terenul 2',
    location: 'Sala A',
    environment: 'Interior',
    surfaceOrDetails: 'Parchet',
    slotsByDay: {
      '2026-10-24': buildStandardSchedule('t2-24', {
        '17:00': 'occupied',
        '10:00': 'pe_class',
        '11:00': 'pe_class',
      }),
      '2026-10-25': buildStandardSchedule('t2-25', {
        '18:00': 'occupied',
        '19:00': 'my_booking',
      }),
      '2026-10-26': buildStandardSchedule('t2-26', { '16:00': 'occupied' }),
      '2026-10-27': buildStandardSchedule('t2-27'),
      '2026-10-28': buildStandardSchedule('t2-28', { '12:00': 'pe_class' }),
      '2026-10-29': buildStandardSchedule('t2-29'),
      '2026-10-30': buildStandardSchedule('t2-30'),
    },
  },
  {
    id: 'res-teren-1-baschet',
    sportId: 'baschet',
    name: 'Terenul 1',
    location: 'Sala B',
    environment: 'Interior',
    surfaceOrDetails: 'Parchet',
    slotsByDay: {
      '2026-10-24': buildStandardSchedule('t1b-24', {
        '17:00': 'occupied',
        '14:00': 'pe_class',
      }),
      '2026-10-25': buildStandardSchedule('t1b-25', { '20:00': 'occupied' }),
      '2026-10-26': buildStandardSchedule('t1b-26'),
      '2026-10-27': buildStandardSchedule('t1b-27', { '18:00': 'occupied' }),
      '2026-10-28': buildStandardSchedule('t1b-28'),
      '2026-10-29': buildStandardSchedule('t1b-29'),
      '2026-10-30': buildStandardSchedule('t1b-30'),
    },
  },
  {
    id: 'res-teren-4-ext',
    sportId: 'baschet',
    name: 'Teren 4',
    location: 'Campus Nord',
    environment: 'Exterior',
    surfaceOrDetails: 'Tartan · Nocturnă',
    slotsByDay: {
      '2026-10-24': buildStandardSchedule('t4-24', { '19:00': 'occupied' }),
      '2026-10-25': buildStandardSchedule('t4-25'),
      '2026-10-26': buildStandardSchedule('t4-26', { '17:00': 'occupied' }),
      '2026-10-27': buildStandardSchedule('t4-27'),
      '2026-10-28': buildStandardSchedule('t4-28'),
      '2026-10-29': buildStandardSchedule('t4-29'),
      '2026-10-30': buildStandardSchedule('t4-30'),
    },
  },

  // Fotbal
  {
    id: 'res-fotbal-1',
    sportId: 'fotbal',
    name: 'Teren fotbal 1',
    location: 'Baza Sportivă',
    environment: 'Exterior',
    surfaceOrDetails: 'Gazon sintetic · Nocturnă',
    slotsByDay: {
      '2026-10-24': buildStandardSchedule('f1-24', {
        '17:00': 'my_booking',
        '18:00': 'occupied',
      }),
      '2026-10-25': buildStandardSchedule('f1-25', { '19:00': 'occupied' }),
      '2026-10-26': buildStandardSchedule('f1-26'),
      '2026-10-27': buildStandardSchedule('f1-27'),
      '2026-10-28': buildStandardSchedule('f1-28', { '10:00': 'pe_class' }),
      '2026-10-29': buildStandardSchedule('f1-29'),
      '2026-10-30': buildStandardSchedule('f1-30'),
    },
  },
  {
    id: 'res-fotbal-2',
    sportId: 'fotbal',
    name: 'Teren fotbal 2',
    location: 'Baza Sportivă',
    environment: 'Exterior',
    surfaceOrDetails: 'Gazon sintetic',
    slotsByDay: {
      '2026-10-24': buildStandardSchedule('f2-24', { '16:00': 'occupied' }),
      '2026-10-25': buildStandardSchedule('f2-25'),
      '2026-10-26': buildStandardSchedule('f2-26'),
      '2026-10-27': buildStandardSchedule('f2-27'),
      '2026-10-28': buildStandardSchedule('f2-28'),
      '2026-10-29': buildStandardSchedule('f2-29'),
      '2026-10-30': buildStandardSchedule('f2-30'),
    },
  },

  // Tenis
  {
    id: 'res-tenis-3',
    sportId: 'tenis',
    name: 'Teren tenis 3',
    location: 'Zona Terenuri',
    environment: 'Exterior',
    surfaceOrDetails: 'Suprafață hard',
    slotsByDay: {
      '2026-10-24': buildStandardSchedule('tn3-24', { '18:00': 'occupied' }),
      '2026-10-25': buildStandardSchedule('tn3-25'),
      '2026-10-26': buildStandardSchedule('tn3-26'),
      '2026-10-27': buildStandardSchedule('tn3-27'),
      '2026-10-28': buildStandardSchedule('tn3-28'),
      '2026-10-29': buildStandardSchedule('tn3-29'),
      '2026-10-30': buildStandardSchedule('tn3-30'),
    },
  },

  // Volei
  {
    id: 'res-volei-1',
    sportId: 'volei',
    name: 'Terenul 1',
    location: 'Sala B',
    environment: 'Interior',
    surfaceOrDetails: 'Parchet · Fileu competițional',
    slotsByDay: {
      '2026-10-24': buildStandardSchedule('vl1-24', { '17:00': 'occupied' }),
      '2026-10-25': buildStandardSchedule('vl1-25', { '17:00': 'my_booking' }),
      '2026-10-26': buildStandardSchedule('vl1-26'),
      '2026-10-27': buildStandardSchedule('vl1-27'),
      '2026-10-28': buildStandardSchedule('vl1-28'),
      '2026-10-29': buildStandardSchedule('vl1-29'),
      '2026-10-30': buildStandardSchedule('vl1-30'),
    },
  },

  // Fitness
  {
    id: 'res-fitness-1',
    sportId: 'fitness',
    name: 'Sala fitness',
    location: 'Corp Central',
    environment: 'Interior',
    surfaceOrDetails: 'Cardio & Forță · 30 locuri',
    slotsByDay: {
      '2026-10-24': buildStandardSchedule('fit-24', { '18:00': 'occupied' }),
      '2026-10-25': buildStandardSchedule('fit-25'),
      '2026-10-26': buildStandardSchedule('fit-26'),
      '2026-10-27': buildStandardSchedule('fit-27'),
      '2026-10-28': buildStandardSchedule('fit-28'),
      '2026-10-29': buildStandardSchedule('fit-29'),
      '2026-10-30': buildStandardSchedule('fit-30'),
    },
  },

  // Înot
  {
    id: 'res-bazin-1',
    sportId: 'inot',
    name: 'Bazin acoperit',
    location: 'Complex Natație',
    environment: 'Interior',
    surfaceOrDetails: '25m · 6 culoare',
    slotsByDay: {
      '2026-10-24': buildStandardSchedule('baz-24', {
        '16:00': 'pe_class',
        '19:00': 'occupied',
      }),
      '2026-10-25': buildStandardSchedule('baz-25'),
      '2026-10-26': buildStandardSchedule('baz-26'),
      '2026-10-27': buildStandardSchedule('baz-27'),
      '2026-10-28': buildStandardSchedule('baz-28'),
      '2026-10-29': buildStandardSchedule('baz-29'),
      '2026-10-30': buildStandardSchedule('baz-30'),
    },
  },
];