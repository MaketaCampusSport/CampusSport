import { http } from './http';

export interface SportDto {
  id: string;
  name: { ro: string; en: string } | string;
  icon?: string;
}

export const SPORT_IMAGE_BY_ICON: Record<string, string> = {
  football: '/images/sports/football.jpg',
  basketball: '/images/sports/basketball.jpg',
  tennis: '/images/sports/tennis.jpg',
  volleyball: '/images/sports/volleyball.jpg',
};

export const SPORT_FALLBACK_GRADIENT: Record<string, string> = {
  football: 'from-emerald-800 to-emerald-950',
  fotbal: 'from-emerald-800 to-emerald-950',
  basketball: 'from-amber-800 to-stone-900',
  baschet: 'from-amber-800 to-stone-900',
  tennis: 'from-blue-700 to-slate-900',
  tenis: 'from-blue-700 to-slate-900',
  volleyball: 'from-orange-700 to-slate-900',
  volei: 'from-orange-700 to-slate-900',
  fitness: 'from-slate-700 to-slate-950',
  pool: 'from-cyan-700 to-blue-950',
  inot: 'from-cyan-700 to-blue-950',
};

export const getSports = (signal?: AbortSignal) =>
  http.get<SportDto[]>('/sports', undefined, signal);