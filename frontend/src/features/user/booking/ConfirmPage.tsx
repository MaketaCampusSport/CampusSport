import { useState } from 'react';
import { Calendar, CalendarPlus, Check, ChevronLeft, Clock, Info, ShieldCheck, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import QRCode from 'react-qr-code';
import type { Booking, SlotReference } from '@/api/generated';
import { ApiError } from '@/api/http';
import { useSession } from '@/auth/sessionStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import {
  bookingCode,
  checkInWindow,
  dayKey,
  FREE_CANCEL_HOURS,
  fmtDayLong,
  fmtTime,
  fmtTimeRange,
  langOf,
  sportGradient,
  sportImage,
  sportName,
} from '../lib';
import { downloadBookingCalendar, useCreateBooking, useJoinWaitlist, useQuota, useResource, useSports } from '../queries';

/** Pasul 3 din 3: rezervarea e confirmată; QR-ul semnat vine de la server (FR-11). */
function SuccessScreen({ booking, sportLabel }: { booking: Booking; sportLabel: string }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const [calendar, setCalendar] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const code = bookingCode(booking);
  const message = lang === 'en' ? booking.message_en : booking.message_ro;

  async function addToCalendar() {
    setCalendar('busy');
    try {
      await downloadBookingCalendar(booking.id, code);
      setCalendar('done');
    } catch {
      setCalendar('error');
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3.5">
        <span className="rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-success-ink">
          {t('user.confirm.success.badge')}
        </span>
        <span className="font-mono text-xs font-bold text-muted">{code}</span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center space-y-5 px-4 py-5 text-center">
        <Card className="flex flex-col items-center border border-line/60 p-5">
          <div className="rounded-2xl bg-white p-2">
            {booking.qr_token && (
              <QRCode value={booking.qr_token} size={192} fgColor="#1A2238" bgColor="#FFFFFF" aria-label={t('user.qr.aria', { code })} />
            )}
          </div>
          <span className="mt-2.5 font-mono text-xs font-bold text-ink">{code}</span>
        </Card>

        <div>
          <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-sun text-onsun">
            <Check size={18} strokeWidth={3} aria-hidden />
          </div>
          <h1 className="heading text-4xl uppercase leading-none tracking-wide text-ink">{t('user.confirm.success.headline')}</h1>
          <p className="mt-1.5 text-sm font-medium text-muted">
            {t('user.confirm.success.subtitlePrefix')} <span className="font-bold lowercase text-ink">{fmtDayLong(booking.start, lang)}</span>{' '}
            {t('user.confirm.success.subtitleAt')} <span className="font-bold text-ink">{fmtTime(booking.start)}</span>{' '}
            {t('user.confirm.success.subtitleOn')} <span className="font-bold text-ink">{booking.resource_name}</span>
          </p>
          {message && <p className="mt-1 text-xs font-semibold text-success-ink">{message}</p>}
        </div>

        <Card className="grid w-full grid-cols-3 divide-x divide-line border border-line/60 p-4">
          {[
            [t('user.confirm.success.courtCol'), sportLabel || booking.resource_name],
            [t('user.confirm.success.dateCol'), fmtDayLong(booking.start, lang)],
            [t('user.confirm.success.timeCol'), fmtTimeRange(booking.start, booking.end)],
          ].map(([label, value]) => (
            <div key={label} className="px-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
              <p className="mt-1 truncate text-xs font-extrabold capitalize text-ink">{value}</p>
            </div>
          ))}
        </Card>

        <p className="text-xs font-medium text-muted">
          {t('user.confirm.success.checkInNote')} <span className="font-bold text-ink">{checkInWindow(booking.start)}</span>
        </p>
      </main>

      <footer className="space-y-2.5 border-t border-line bg-surface px-4 py-4">
        <Button
          variant="outline"
          size="lg"
          loading={calendar === 'busy'}
          onClick={() => void addToCalendar()}
          leftIcon={<CalendarPlus size={18} className="text-brand-text" aria-hidden />}
          className="w-full"
        >
          {calendar === 'done'
            ? t('user.confirm.success.addedToCalendar')
            : calendar === 'error'
              ? t('user.confirm.success.calendarFailed')
              : t('user.confirm.success.addToCalendar')}
        </Button>
        <Button variant="accent" size="lg" onClick={() => navigate('/user/bookings')} className="w-full">
          {t('user.confirm.success.done')}
        </Button>
      </footer>
    </div>
  );
}

/** Pasul 2 din 3: confirmarea rezervării (MAKETA-70). Slotul vine din URL: `/user/book/:resourceId?start&end&sport`. */
export default function ConfirmPage() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const { resourceId } = useParams();
  const [params] = useSearchParams();
  const start = params.get('start');
  const end = params.get('end');
  const sportId = params.get('sport') ?? undefined;
  const role = useSession((s) => s.user?.role);

  const resource = useResource(resourceId);
  const sports = useSports();
  const quota = useQuota();
  const create = useCreateBooking();
  const waitlist = useJoinWaitlist();
  const [participants, setParticipants] = useState(1);
  const [heroFailed, setHeroFailed] = useState(false);

  if (!resourceId || !start || !end) return <Navigate to="/user/search" replace />;

  const sport = sports.data?.find((s) => s.id === sportId);
  const sportLabel = sportName(sport, lang);
  const maxCapacity = Math.max(1, resource.data?.capacity ?? 1);
  const back = () => navigate(`/user/search?${new URLSearchParams({ ...(sportId ? { sport: sportId } : {}), date: dayKey(start) })}`);

  if (create.data) return <SuccessScreen booking={create.data} sportLabel={sportLabel} />;

  const error = create.error instanceof ApiError ? create.error : null;
  const slotTaken = error?.code === 'SLOT_TAKEN' || error?.code === 'SLOT_BLOCKED';
  const offer = (error?.body?.waitlist_offer as SlotReference | undefined) ?? { resource_id: resourceId, start, end };
  const hero = sportImage(sport?.icon);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            aria-label={t('user.confirm.backToSlotsAria')}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-subtle"
          >
            <ChevronLeft size={22} strokeWidth={2.5} aria-hidden />
          </button>
          <div className="text-center">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-brand-text">{t('user.confirm.stepConfirm')}</span>
            <h1 className="heading text-2xl uppercase leading-tight tracking-wide text-ink">{t('user.confirm.title')}</h1>
          </div>
          <div className="w-11" aria-hidden />
        </div>
        <p className="mt-0.5 text-center text-xs font-medium text-muted">{t('user.confirm.subtitle')}</p>
      </header>

      <main className="flex-1 space-y-4 px-4 py-4">
        {slotTaken && (
          <Banner
            role="alert"
            tone="warn"
            title={waitlist.isSuccess ? t('user.confirm.errors.waitlistJoinedTitle') : t('user.confirm.errors.slotTakenTitle')}
          >
            <p>{waitlist.isSuccess ? t('user.confirm.errors.waitlistJoinedBody') : t('user.confirm.errors.slotTakenBody')}</p>
            {!waitlist.isSuccess && (
              <Button
                variant="primary"
                size="sm"
                loading={waitlist.isPending}
                onClick={() => waitlist.mutate({ day: dayKey(offer.start), resource_id: offer.resource_id, start: offer.start, end: offer.end })}
                className="mt-2.5"
              >
                {t('user.confirm.errors.joinWaitlist')}
              </Button>
            )}
            {waitlist.isError && (
              <p className="mt-2 text-xs font-semibold text-danger-ink">
                {waitlist.error instanceof ApiError ? waitlist.error.message : t('errors.generic')}
              </p>
            )}
          </Banner>
        )}
        {error?.code === 'QUOTA_EXHAUSTED' && (
          <Banner role="alert" tone="danger" title={t('user.confirm.errors.quotaExhaustedTitle')}>
            <p>{t('user.confirm.errors.quotaExhaustedBody')}</p>
          </Banner>
        )}
        {create.isError && !slotTaken && error?.code !== 'QUOTA_EXHAUSTED' && (
          <Banner role="alert" tone="danger" title={error?.message ?? t('errors.generic')} />
        )}

        <div className="relative h-36 overflow-hidden rounded-2xl bg-navy shadow-card">
          {hero && !heroFailed ? (
            <img src={hero} alt="" onError={() => setHeroFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className={cn('absolute inset-0 bg-gradient-to-br', sportGradient(sport?.icon))} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute bottom-3.5 left-4 right-4 text-white">
            <h2 className="heading text-2xl uppercase leading-tight tracking-wide text-white">{resource.data?.name ?? '…'}</h2>
            <p className="mt-0.5 text-xs font-medium text-white/90">
              {[sportLabel, resource.data?.location].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <Card aria-label={t('user.confirm.detailsAria')} className="divide-y divide-line border border-line/60 p-4">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2.5 text-muted">
              <Calendar size={17} className="shrink-0 text-brand-text" aria-hidden />
              <span className="text-xs font-semibold">{t('user.confirm.dateLabel')}</span>
            </div>
            <span className="text-sm font-bold capitalize text-ink">{fmtDayLong(start, lang)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2.5 text-muted">
              <Clock size={17} className="shrink-0 text-brand-text" aria-hidden />
              <span className="text-xs font-semibold">{t('user.confirm.timeLabel')}</span>
            </div>
            <span className="text-sm font-bold text-ink">{fmtTimeRange(start, end)}</span>
          </div>
          {maxCapacity > 1 && (
            <div className="flex items-center justify-between gap-3 pt-3">
              <div className="flex items-center gap-2.5 text-muted">
                <Users size={17} className="shrink-0 text-brand-text" aria-hidden />
                <div>
                  <span className="block text-xs font-semibold">{t('user.confirm.participantsLabel')}</span>
                  <span className="block text-[11px] text-muted/80">{t('user.confirm.participantsHint', { max: maxCapacity })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t('user.confirm.decreaseParticipantsAria')}
                  onClick={() => setParticipants((p) => Math.max(1, p - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-subtle font-bold text-ink transition-colors hover:bg-line/70"
                >
                  -
                </button>
                <span className="w-7 text-center text-sm font-extrabold text-ink" aria-live="polite">
                  {participants}
                </span>
                <button
                  type="button"
                  aria-label={t('user.confirm.increaseParticipantsAria')}
                  onClick={() => setParticipants((p) => Math.min(maxCapacity, p + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-subtle font-bold text-ink transition-colors hover:bg-line/70"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card aria-label={t('user.confirm.policiesAria')} className="space-y-3 border border-line/60 p-4">
          {role === 'student' && quota.data && (
            <div className="flex items-center justify-between rounded-xl bg-brand-soft px-3.5 py-2.5">
              <span className="text-xs font-bold text-ink">{t('user.confirm.quotaUsage')}</span>
              <span className="text-xs font-extrabold text-brand-text">
                {t('user.confirm.quotaRemaining', { remaining: Math.max(0, quota.data.remaining - 1), total: quota.data.limit })}
              </span>
            </div>
          )}
          <div className="space-y-2 text-xs text-muted">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="shrink-0 text-success" aria-hidden />
              <span>{t('user.confirm.freeCancelRule', { hours: FREE_CANCEL_HOURS })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Info size={16} className="shrink-0 text-brand-text" aria-hidden />
              <span>{t('user.confirm.checkInRule', { window: checkInWindow(start) })}</span>
            </div>
          </div>
        </Card>
      </main>

      <footer className="space-y-2.5 border-t border-line bg-surface px-4 py-4">
        <Button
          variant="accent"
          size="lg"
          loading={create.isPending}
          disabled={error?.code === 'QUOTA_EXHAUSTED' || slotTaken}
          onClick={() =>
            create.mutate({
              resource_id: resourceId,
              start,
              ...(sportId ? { sport_id: sportId } : {}),
              ...(maxCapacity > 1 ? { participants_count: participants } : {}),
            })
          }
          className="w-full"
        >
          {create.isPending ? t('user.confirm.submitting') : t('user.confirm.submit')}
        </Button>
        <Button variant="outline" size="md" onClick={back} className="w-full">
          {t('user.confirm.back')}
        </Button>
      </footer>
    </div>
  );
}
