import { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarPlus,
  Check,
  ChevronLeft,
  Clock,
  Info,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-qr-code';
import { useCreateBooking, useJoinWaitlist, type BookingCreatedDto } from '@/api/bookings';
import { ApiError } from '@/api/http';
import { SPORT_FALLBACK_GRADIENT } from '@/api/sports';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import type { SelectedSlotSummary } from './mapAvailability';
import type { ActiveReservation } from '../components/QrTicketCard';

interface BookingConfirmScreenProps {
  selection: SelectedSlotSummary;
  remainingEntries: number;
  totalEntries: number;
  onBack: () => void;
  onComplete: (createdReservation: ActiveReservation) => void;
}

const LOCAL_SPORT_IMAGES: Record<string, string> = {
  fotbal: '/images/sports/football.jpg',
  football: '/images/sports/football.jpg',
  baschet: '/images/sports/basketball.jpg',
  basketball: '/images/sports/basketball.jpg',
  tenis: '/images/sports/tennis.jpg',
  tennis: '/images/sports/tennis.jpg',
  volei: '/images/sports/volleyball.jpg',
  volleyball: '/images/sports/volleyball.jpg',
  fitness: '/images/sports/fitness.jpg',
  inot: '/images/sports/pool.jpg',
  pool: '/images/sports/pool.jpg',
};

const SPORT_CAPACITY: Record<string, number> = {
  fotbal: 22,
  football: 22,
  baschet: 10,
  basketball: 10,
  tenis: 4,
  tennis: 4,
  volei: 12,
  volleyball: 12,
  fitness: 30,
  inot: 24,
  pool: 24,
};

function computeCheckInWindow(startTime: string): string {
  const [hoursStr, minutesStr] = startTime.split(':');
  const startTotalMinutes = Number(hoursStr) * 60 + Number(minutesStr);

  const formatMinutes = (totalMins: number) => {
    const normalized = ((totalMins % 1440) + 1440) % 1440;
    const h = Math.floor(normalized / 60)
      .toString()
      .padStart(2, '0');
    const m = (normalized % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  return `${formatMinutes(startTotalMinutes - 10)} – ${formatMinutes(
    startTotalMinutes + 15,
  )}`;
}

/**
 * Confirmation (Step 02/03) & Success with QR (Step 03/03) screens (MAKETA-70 / FR-11).
 */
export default function BookingConfirmScreen({
  selection,
  remainingEntries,
  totalEntries,
  onBack,
  onComplete,
}: BookingConfirmScreenProps) {
  const { t, i18n } = useTranslation();
  const [participantsCount, setParticipantsCount] = useState<number>(1);
  const [createdBooking, setCreatedBooking] = useState<BookingCreatedDto | null>(null);
  const [calendarSaved, setCalendarSaved] = useState(false);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);

  const createMutation = useCreateBooking();
  const waitlistMutation = useJoinWaitlist();

  const maxCapacity = SPORT_CAPACITY[selection.sportId] ?? 10;
  const remainingAfterBooking = Math.max(0, remainingEntries - 1);
  const selectedYear = selection.dayId.slice(0, 4);
  const startIso = `${selection.dayId}T${selection.time}:00+02:00`;

  const checkInWindow = useMemo(
    () => computeCheckInWindow(selection.time),
    [selection.time],
  );

  const reservationCode = useMemo(() => {
    if (createdBooking?.id) {
      return `#${createdBooking.id.toUpperCase()}`;
    }
    const numericSuffix = (
      selection.time.replace(':', '') +
      selection.resourceName.length * 17
    ).slice(0, 4);
    return `#RES-${numericSuffix.padEnd(4, '4')}`;
  }, [createdBooking, selection.time, selection.resourceName]);

  const createdReservation: ActiveReservation = useMemo(() => {
    const [dayShortRaw, dayRest] = selection.dayLabel.split(',');
    const dayNumberMatch = (dayRest ?? '').trim().match(/\d+/);
    return {
      id: createdBooking?.id ?? `res-${Date.now()}`,
      code: reservationCode,
      qrToken: createdBooking?.qr_token,
      sportName: selection.sportName,
      resourceName: selection.resourceName,
      locationLabel: selection.location,
      dayShort: (dayShortRaw ?? '').trim().toUpperCase(),
      dayNumber: dayNumberMatch ? dayNumberMatch[0] : selection.dayId.slice(8, 10),
      dateLabel: selection.dayLabel,
      timeSlot: `${selection.time} – ${selection.endTime}`,
      checkInWindow,
    };
  }, [createdBooking, selection, reservationCode, checkInWindow]);

  const handleConfirmBooking = () => {
    if (createMutation.isPending) return;
    createMutation.mutate(
      {
        resource_id: selection.resourceId,
        start: startIso,
        participants_count: participantsCount,
      },
      {
        onSuccess: (res) => {
          setCreatedBooking(res);
        },
      },
    );
  };

  const handleJoinWaitlist = () => {
    if (waitlistMutation.isPending || waitlistJoined) return;
    waitlistMutation.mutate(
      {
        resource_id: selection.resourceId,
        start: startIso,
      },
      {
        onSuccess: () => {
          setWaitlistJoined(true);
        },
      },
    );
  };

  // Punctul 4: .ics generat în client cu fus orar explicit (Europe/Chisinau)
  const handleAddToCalendar = () => {
    const dateCompact = selection.dayId.replace(/-/g, '');
    const startCompact = `${selection.time.replace(':', '')}00`;
    const endCompact = `${selection.endTime.replace(':', '')}00`;
    const qrToken = createdBooking?.qr_token ?? reservationCode;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CampusSport//Rezervare//RO',
      'CALSCALE:GREGORIAN',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Chisinau',
      'BEGIN:STANDARD',
      'DTSTART:19701025T040000',
      'TZOFFSETFROM:+0300',
      'TZOFFSETTO:+0200',
      'TZNAME:EET',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:19700329T030000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0300',
      'TZNAME:EEST',
      'END:DAYLIGHT',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      `UID:${reservationCode.replace('#', '')}@campussport.ro`,
      `DTSTART;TZID=Europe/Chisinau:${dateCompact}T${startCompact}`,
      `DTEND;TZID=Europe/Chisinau:${dateCompact}T${endCompact}`,
      `SUMMARY:${selection.sportName} - ${selection.resourceName} (${reservationCode})`,
      `LOCATION:${selection.resourceName}, ${selection.location}`,
      `DESCRIPTION:Cod acces QR: ${qrToken}. Check-in permis între ${checkInWindow}.`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CampusSport-${reservationCode.replace('#', '')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setCalendarSaved(true);
  };

  // STEP 03/03: Success Screen with QR
  if (createdBooking) {
    const shortDayLabel = selection.dayLabel.replace(',', '');
    const apiMessage = i18n.language.startsWith('en')
      ? createdBooking.message_en
      : createdBooking.message_ro;

    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between border-x border-line bg-subtle shadow-card">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3.5">
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-success-ink">
            {t('user.confirm.success.badge')}
          </span>
          <span className="font-mono text-xs font-bold text-muted">
            {reservationCode}
          </span>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center space-y-5 overflow-y-auto px-4 py-5 text-center">
          {/* QR Card cu react-qr-code și qr_token din API */}
          <Card className="flex flex-col items-center border border-line/60 p-5">
            <div className="rounded-2xl bg-white p-2">
              <QRCode
                value={createdBooking.qr_token}
                size={192}
                fgColor="#1A2238"
                bgColor="#FFFFFF"
                aria-label={t('user.confirm.success.qrAria', { code: reservationCode })}
              />
            </div>
            <span className="mt-2.5 font-mono text-xs font-bold text-ink">
              {reservationCode}
            </span>
          </Card>

          {/* Headline & Subtitle */}
          <div>
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-sun text-onsun">
              <Check size={18} strokeWidth={3} />
            </div>
            <h1 className="heading text-4xl uppercase leading-none tracking-wide text-ink">
              {t('user.confirm.success.headline')}
            </h1>
            <p className="mt-1.5 text-sm font-medium text-muted">
              {t('user.confirm.success.subtitlePrefix')}{' '}
              <span className="font-bold text-ink lowercase">{shortDayLabel}</span>{' '}
              {t('user.confirm.success.subtitleAt')}{' '}
              <span className="font-bold text-ink">{selection.time}</span>{' '}
              {t('user.confirm.success.subtitleOn')}{' '}
              <span className="font-bold text-ink">{selection.resourceName}</span>
            </p>
            {apiMessage && (
              <p className="mt-1 text-xs font-semibold text-success-ink">
                {apiMessage}
              </p>
            )}
          </div>

          {/* 3-Column Summary Card: TEREN | DATA | ORA */}
          <Card className="grid w-full grid-cols-3 divide-x divide-line border border-line/60 p-4">
            <div className="px-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {t('user.confirm.success.courtCol')}
              </p>
              <p className="mt-1 truncate text-xs font-extrabold text-ink">
                {selection.resourceName}
              </p>
            </div>
            <div className="px-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {t('user.confirm.success.dateCol')}
              </p>
              <p className="mt-1 text-xs font-extrabold text-ink capitalize">
                {shortDayLabel}
              </p>
            </div>
            <div className="px-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {t('user.confirm.success.timeCol')}
              </p>
              <p className="mt-1 text-xs font-extrabold text-ink">
                {selection.time}
              </p>
            </div>
          </Card>

          <p className="text-xs font-medium text-muted">
            {t('user.confirm.success.checkInNote')}{' '}
            <span className="font-bold text-ink">{checkInWindow}</span>
          </p>
        </main>

        <footer className="shrink-0 space-y-2.5 border-t border-line bg-surface px-4 py-4">
          <Button
            variant="outline"
            size="lg"
            onClick={handleAddToCalendar}
            leftIcon={<CalendarPlus size={18} className="text-brand-text" />}
            className="w-full"
          >
            {calendarSaved
              ? t('user.confirm.success.addedToCalendar')
              : t('user.confirm.success.addToCalendar')}
          </Button>

          <Button
            variant="accent"
            size="lg"
            onClick={() => onComplete(createdReservation)}
            className="w-full"
          >
            {t('user.confirm.success.done')}
          </Button>
        </footer>
      </div>
    );
  }

  // STEP 02/03: Confirmation Screen
  const apiError = createMutation.error instanceof ApiError ? createMutation.error : null;
  const isSlotTaken = apiError?.status === 409 || apiError?.code === 'SLOT_TAKEN';
  const isQuotaExhausted =
    apiError?.status === 422 || apiError?.code === 'QUOTA_EXHAUSTED';

  const heroImage = LOCAL_SPORT_IMAGES[selection.sportId];
  const fallbackGradient =
    SPORT_FALLBACK_GRADIENT[selection.sportId] ?? 'from-slate-700 to-slate-950';

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between border-x border-line bg-subtle shadow-card">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('user.confirm.backToSlotsAria')}
            className="-ml-2 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-ink transition-colors hover:bg-subtle"
          >
            <ChevronLeft size={22} strokeWidth={2.5} />
          </button>

          <div className="text-center">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-brand-text">
              {t('user.confirm.stepConfirm')}
            </span>
            <h1 className="heading text-2xl uppercase leading-tight tracking-wide text-ink">
              {t('user.confirm.title')}
            </h1>
          </div>

          <div className="w-11" aria-hidden="true" />
        </div>
        <p className="mt-0.5 text-center text-xs font-medium text-muted">
          {t('user.confirm.subtitle')}
        </p>
      </header>

      {/* Main Content */}
      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Erori API: 409 SLOT_TAKEN / 422 QUOTA_EXHAUSTED / generic */}
        {isSlotTaken && (
          <Banner
            role="alert"
            tone="warn"
            title={
              waitlistJoined
                ? t('user.confirm.errors.waitlistJoinedTitle')
                : t('user.confirm.errors.slotTakenTitle')
            }
          >
            <p>
              {waitlistJoined
                ? t('user.confirm.errors.waitlistJoinedBody')
                : t('user.confirm.errors.slotTakenBody')}
            </p>
            {!waitlistJoined && (
              <Button
                variant="primary"
                size="sm"
                loading={waitlistMutation.isPending}
                onClick={handleJoinWaitlist}
                className="mt-2.5"
              >
                {waitlistMutation.isPending
                  ? t('user.confirm.errors.joiningWaitlist')
                  : t('user.confirm.errors.joinWaitlist')}
              </Button>
            )}
          </Banner>
        )}

        {isQuotaExhausted && (
          <Banner
            role="alert"
            tone="danger"
            title={t('user.confirm.errors.quotaExhaustedTitle')}
          >
            <p>{t('user.confirm.errors.quotaExhaustedBody')}</p>
          </Banner>
        )}

        {createMutation.isError && !isSlotTaken && !isQuotaExhausted && (
          <Banner
            role="alert"
            tone="danger"
            title={apiError?.message ?? t('errors.generic')}
          />
        )}

        {/* Resource Hero Banner */}
        <div className="relative h-36 overflow-hidden rounded-2xl bg-navy shadow-card">
          {heroImage && !heroImageFailed ? (
            <img
              src={heroImage}
              alt={selection.resourceName}
              onError={() => setHeroImageFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className={cn('absolute inset-0 bg-gradient-to-br', fallbackGradient)}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute right-4 bottom-3.5 left-4 text-white">
            <h2 className="heading text-2xl uppercase leading-tight tracking-wide text-white">
              {selection.resourceName}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-white/90">
              {selection.sportName} · {selection.location}
            </p>
          </div>
        </div>

        {/* Booking Details Card */}
        <Card
          aria-label={t('user.confirm.detailsAria')}
          className="divide-y divide-line border border-line/60 p-4"
        >
          <div className="flex items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2.5 text-muted">
              <Calendar size={17} className="shrink-0 text-brand-text" />
              <span className="text-xs font-semibold">
                {t('user.confirm.dateLabel')}
              </span>
            </div>
            <span className="text-sm font-bold text-ink capitalize">
              {selection.dayLabel} {selectedYear}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2.5 text-muted">
              <Clock size={17} className="shrink-0 text-brand-text" />
              <span className="text-xs font-semibold">
                {t('user.confirm.timeLabel')}
              </span>
            </div>
            <span className="text-sm font-bold text-ink">
              {selection.time} – {selection.endTime}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3">
            <div className="flex items-center gap-2.5 text-muted">
              <Users size={17} className="shrink-0 text-brand-text" />
              <div>
                <span className="block text-xs font-semibold">
                  {t('user.confirm.participantsLabel')}
                </span>
                <span className="block text-[11px] text-muted/80">
                  {t('user.confirm.participantsHint', { max: maxCapacity })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('user.confirm.decreaseParticipantsAria')}
                onClick={() =>
                  setParticipantsCount((prev) => Math.max(1, prev - 1))
                }
                className="flex h-9 w-9 min-h-[36px] min-w-[36px] items-center justify-center rounded-xl bg-subtle font-bold text-ink transition-colors hover:bg-line/70"
              >
                -
              </button>
              <span className="w-7 text-center text-sm font-extrabold text-ink">
                {participantsCount}
              </span>
              <button
                type="button"
                aria-label={t('user.confirm.increaseParticipantsAria')}
                onClick={() =>
                  setParticipantsCount((prev) => Math.min(maxCapacity, prev + 1))
                }
                className="flex h-9 w-9 min-h-[36px] min-w-[36px] items-center justify-center rounded-xl bg-subtle font-bold text-ink transition-colors hover:bg-line/70"
              >
                +
              </button>
            </div>
          </div>
        </Card>

        {/* Quota & Policies Card */}
        <Card
          aria-label={t('user.confirm.policiesAria')}
          className="space-y-3 border border-line/60 p-4"
        >
          <div className="flex items-center justify-between rounded-xl bg-brand-soft px-3.5 py-2.5">
            <span className="text-xs font-bold text-ink">
              {t('user.confirm.quotaUsage')}
            </span>
            <span className="text-xs font-extrabold text-brand-text">
              {t('user.confirm.quotaRemaining', {
                remaining: remainingAfterBooking,
                total: totalEntries,
              })}
            </span>
          </div>

          <div className="space-y-2 text-xs text-muted">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="shrink-0 text-success" />
              <span>{t('user.confirm.freeCancelRule')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Info size={16} className="shrink-0 text-brand-text" />
              <span>
                {t('user.confirm.checkInRule', { window: checkInWindow })}
              </span>
            </div>
          </div>
        </Card>
      </main>

      {/* Action Buttons */}
      <footer className="shrink-0 space-y-2.5 border-t border-line bg-surface px-4 py-4">
        <Button
          variant="accent"
          size="lg"
          loading={createMutation.isPending}
          disabled={isQuotaExhausted}
          onClick={handleConfirmBooking}
          className="w-full"
        >
          {createMutation.isPending
            ? t('user.confirm.submitting')
            : t('user.confirm.submit')}
        </Button>

        <Button
          variant="outline"
          size="md"
          onClick={onBack}
          className="w-full"
        >
          {t('user.confirm.back')}
        </Button>
      </footer>
    </div>
  );
}