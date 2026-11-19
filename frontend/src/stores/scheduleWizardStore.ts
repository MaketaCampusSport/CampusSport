import { create } from 'zustand';
import type { SchedulePreview, ScheduleResult } from '@/api/types';

/**
 * Starea fluxului „Orar EF” (încarcă → verifică conflictele → confirmă).
 * Stă în Zustand ca administratorul să poată naviga în altă pagină și să revină fără să piardă previzualizarea.
 */
interface ScheduleWizardState {
  step: 1 | 2 | 3;
  preview: SchedulePreview | null;
  result: ScheduleResult | null;
  setPreview: (preview: SchedulePreview) => void;
  setResult: (result: ScheduleResult) => void;
  backToUpload: () => void;
  reset: () => void;
}

export const useScheduleWizardStore = create<ScheduleWizardState>((set) => ({
  step: 1,
  preview: null,
  result: null,
  setPreview: (preview) => set({ preview, result: null, step: 2 }),
  setResult: (result) => set({ result, step: 3 }),
  backToUpload: () => set({ step: 1, preview: null, result: null }),
  reset: () => set({ step: 1, preview: null, result: null }),
}));
