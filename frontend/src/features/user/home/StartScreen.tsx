import { useState } from 'react';
import { format } from 'date-fns';
import { enUS, ro } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import QrTicketCard, { type ActiveReservation } from '../components/QrTicketCard';
import { BottomNav } from '../../../components/BottomNav'

interface SportCardItem {
  id: string;
  name: string;
  imageUrl: string;
  fallbackGradient: string;
}

const SPORTS_GRID: SportCardItem[] = [
  {
    id: 'fotbal',
    name: 'Fotbal',
    imageUrl: '/images/sports/football.jpg',
    fallbackGradient: 'from-emerald-800 to-emerald-950',
  },
  {
    id: 'baschet',
    name: 'Baschet',
    imageUrl: '/images/sports/basketball.jpg',
    fallbackGradient: 'from-amber-800 to-stone-900',
  },
  {
    id: 'tenis',
    name: 'Tenis',
    imageUrl: '/images/sports/tennis.jpg',
    fallbackGradient: 'from-blue-700 to-slate-900',
  },
  {
    id: 'volei',
    name: 'Volei',
    imageUrl: '/images/sports/volleyball.jpg',
    fallbackGradient: 'from-orange-700 to-slate-900',
  },
  {
    id: 'fitness',
    name: 'Fitness',
    imageUrl: '/images/sports/fitness.jpg',
    fallbackGradient: 'from-slate-700 to-slate-950',
  },
  {
    id: 'inot',
    name: 'Înot',
    imageUrl: '/images/sports/pool.jpg',
    fallbackGradient: 'from-cyan-700 to-blue-950',
  },
];

export const DEFAULT_UPCOMING_RESERVATION: ActiveReservation = {
  id: 'res-8924',
  code: '#RES-8924',
  sportName: 'Fotbal',
  resourceName: 'Terenul 1',
  locationLabel: 'Exterior',
  dayShort: 'JOI',
  dayNumber: '24',
  dateLabel: 'Joi, 24 oct',
  timeSlot: '17:00 – 18:00',
  checkInWindow: '16:50 – 17:15',
};

interface StartScreenProps {
  userName?: string;
  userFullName?: string;
  remainingEntries?: number;
  totalEntries?: number;
  upcomingReservation?: ActiveReservation;
  onSelectSport?: (sportId: string) => void;
  onOpenProfile?: () => void;
}

/**
 * Student Start Screen matching UI Design page 16 (MAKETA-68).
 */
export default function StartScreen({
  userName = 'Andrei',
  userFullName = 'Andrei Popescu',
  remainingEntries = 3,
  totalEntries = 4,
  upcomingReservation = DEFAULT_UPCOMING_RESERVATION,
  onSelectSport,
  onOpenProfile,
}: StartScreenProps) {
  const { t, i18n } = useTranslation();
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const dateLocale = i18n.language.startsWith('en') ? enUS : ro;
  const currentMonth = format(new Date(), 'LLLL', { locale: dateLocale });

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between border-x border-line bg-subtle shadow-card">
      {/* Main Content */}
      <div className="flex flex-1 flex-col justify-between gap-4 overflow-y-auto px-4 pt-5 pb-4">
        {/* Top Greeting Header */}
        <header className="flex items-center justify-between pt-1">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {t('user.home.subtitle')}
            </p>
            <h1 className="heading mt-0.5 text-3xl leading-tight text-ink">
              {t('user.home.greeting', { name: userName })}
            </h1>
          </div>

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label={t('user.home.myProfile')}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Avatar name={userFullName} tone="accent" size="md" />
          </button>
        </header>

        {/* FR-26: Segmented Monthly Quota Card */}
        <Card aria-label={t('user.home.quotaAria')} className="border border-line/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold leading-none text-brand-text">
                {remainingEntries}
              </span>
              <span className="text-sm font-bold text-ink">
                {t('user.home.remainingOfTotal', { total: totalEntries })}
              </span>
            </div>

            <Badge tone="brand" className="capitalize">
              {currentMonth}
            </Badge>
          </div>

          <div
            className="grid grid-cols-4 gap-2"
            role="progressbar"
            aria-valuenow={remainingEntries}
            aria-valuemin={0}
            aria-valuemax={totalEntries}
            aria-label={t('user.home.remainingProgressAria', {
              remaining: remainingEntries,
              total: totalEntries,
            })}
          >
            {Array.from({ length: totalEntries }).map((_, index) => {
              const isActive = index < remainingEntries;
              return (
                <span
                  key={index}
                  className={cn(
                    'h-2 rounded-full transition-colors',
                    isActive ? 'bg-brand' : 'bg-line',
                  )}
                />
              );
            })}
          </div>
        </Card>

        {/* UI-02: 3x2 Photographic Sport Selection Grid */}
        <section aria-label={t('user.home.chooseSport')} className="my-auto">
          <div className="grid grid-cols-3 gap-2.5">
            {SPORTS_GRID.map((sport) => {
              const hasImageError = Boolean(failedImages[sport.id]);

              return (
                <button
                  key={sport.id}
                  type="button"
                  onClick={() => onSelectSport?.(sport.id)}
                  className="group relative aspect-square min-h-[96px] overflow-hidden rounded-2xl bg-navy text-left shadow-card transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]"
                >
                  {!hasImageError ? (
                    <img
                      src={sport.imageUrl}
                      alt={sport.name}
                      loading="lazy"
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [sport.id]: true }))
                      }
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className={cn(
                        'absolute inset-0 bg-gradient-to-br',
                        sport.fallbackGradient,
                      )}
                    />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                  <span className="absolute right-2 bottom-2.5 left-3 text-sm font-bold leading-tight text-white">
                    {sport.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* UI-02: Next reservation card with quick QR pass */}
        <QrTicketCard reservation={upcomingReservation} />
      </div>

      {/* Bottom Navigation Bar */}
      <BottomNav />
    </div>
  );
}