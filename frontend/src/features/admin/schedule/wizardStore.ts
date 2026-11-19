import { create } from 'zustand';
import type { BookingConflict, ScheduleClassCreate, ScheduleImportPreview, ScheduleImportResult } from '@/api/client';

/** Pasul 2: conflictele unui import din fișier sau ale unei ore introduse manual (409 CONFLICTS_NEED_CONFIRMATION). */
export type SchedulePending =
  | { kind: 'file'; preview: ScheduleImportPreview }
  | { kind: 'manual'; input: ScheduleClassCreate; conflicts: BookingConflict[] };

/**
 * Starea fluxului „Orar EF” (încarcă → verifică conflictele → confirmă).
 * Stă în Zustand ca administratorul să poată naviga în altă pagină și să revină fără să piardă previzualizarea.
 */
interface ScheduleWizardState {
  step: 1 | 2 | 3;
  pending: SchedulePending | null;
  result: ScheduleImportResult | null;
  setPending: (pending: SchedulePending) => void;
  setResult: (result: ScheduleImportResult) => void;
  backToUpload: () => void;
  reset: () => void;
}

export const useScheduleWizardStore = create<ScheduleWizardState>((set) => ({
  step: 1,
  pending: null,
  result: null,
  setPending: (pending) => set({ pending, result: null, step: 2 }),
  setResult: (result) => set({ result, step: 3 }),
  backToUpload: () => set({ step: 1, pending: null, result: null }),
  reset: () => set({ step: 1, pending: null, result: null }),
}));
