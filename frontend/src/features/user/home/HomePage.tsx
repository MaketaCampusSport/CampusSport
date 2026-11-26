import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useSession } from '@/auth/sessionStore';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import QrTicketCard from '../components/QrTicketCard';
import { fmtMonth, isUpcoming, langOf, sportGradient, sportImage, sportName } from '../lib';
import { useMyBookings, useQuota, useSports } from '../queries';

/** Cota lunară segmentată (FR-26): doar pentru studenți. */
function QuotaCard() {
  const { t, i18n } = useTranslation();
  const quota = useQuota();
  if (quota.isPending) return <Skeleton className="h-[88px] rounded-3xl" />;
  if (quota.isError) return null;
  const { remaining, limit } = quota.data;
  return (
    <Card aria-label={t('user.home.quotaAria')} className="border border-line/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold leading-none text-brand-text">{remaining}</span>
          <span className="text-sm font-bold text-ink">{t('user.home.remainingOfTotal', { total: limit })}</span>
        </div>
        <Badge tone="brand" className="capitalize">
          {fmtMonth(new Date(), langOf(i18n.language))}
        </Badge>
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, limit)}, minmax(0, 1fr))` }}
        role="progressbar"
        aria-valuenow={remaining}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={t('user.home.remainingProgressAria', { remaining, total: limit })}
      >
        {Array.from({ length: limit }).map((_, i) => (
          <span key={i} className={cn('h-2 rounded-full transition-colors', i < remaining ? 'bg-brand' : 'bg-line')} />
        ))}
      </div>
      {quota.data.over_quota_last_24h_only && (
        <p className="mt-3 text-xs font-semibold text-muted">{t('user.home.lastMinuteOnly')}</p>
      )}
    </Card>
  );
}

/** Ecranul de start (UI Design p. 16): salut, cotă, sporturile din catalog, următoarea rezervare. */
export default function HomePage() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const sports = useSports();
  const upcoming = useMyBookings('upcoming');
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  const next = (upcoming.data?.items ?? []).filter(isUpcoming).sort((a, b) => a.start.localeCompare(b.start))[0];
  const firstName = user?.full_name.split(' ')[0] ?? '';

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-5">
      <header className="flex items-center justify-between pt-1">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{t('user.home.subtitle')}</p>
          <h1 className="heading mt-0.5 text-3xl leading-tight text-ink">
            {t('user.home.greeting', { name: firstName })}
          </h1>
        </div>
        <Link
          to="/user/profile"
          aria-label={t('user.home.myProfile')}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Avatar name={user?.full_name ?? ''} src={user?.avatar_url} tone="accent" size="md" />
        </Link>
      </header>

      {user?.role === 'student' && <QuotaCard />}

      <section aria-labelledby="choose-sport" className="my-auto">
        <h2 id="choose-sport" className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">
          {t('user.home.chooseSport')}
        </h2>
        {sports.isPending ? (
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <Skeleton key={n} className="aspect-square rounded-2xl" />
            ))}
          </div>
        ) : sports.isError ? (
          <ErrorState onRetry={() => void sports.refetch()} />
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {sports.data.map((sport) => {
              const image = sportImage(sport.icon);
              return (
                <button
                  key={sport.id}
                  type="button"
                  onClick={() => navigate(`/user/search?sport=${encodeURIComponent(sport.id)}`)}
                  className="group relative aspect-square min-h-[96px] overflow-hidden rounded-2xl bg-navy text-left shadow-card transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]"
                >
                  {image && !failed[sport.id] ? (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      onError={() => setFailed((prev) => ({ ...prev, [sport.id]: true }))}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className={cn('absolute inset-0 bg-gradient-to-br', sportGradient(sport.icon))} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <span className="absolute bottom-2.5 left-3 right-2 text-sm font-bold leading-tight text-white">
                    {sportName(sport, lang)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {next ? (
        <QrTicketCard booking={next} />
      ) : (
        upcoming.isSuccess && (
          <Card className="border border-dashed border-line p-4 text-center">
            <p className="text-sm font-bold text-ink">{t('user.home.noUpcomingTitle')}</p>
            <p className="mt-1 text-xs text-muted">{t('user.home.noUpcomingBody')}</p>
          </Card>
        )
      )}
    </div>
  );
}
