import { CalendarPlus, QrCode, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Booking, WaitlistEntry } from '@/api/generated';
import { ApiError } from '@/api/http';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/Modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { toast } from '@/stores/toastStore';
import { QrPassModal } from '../components/QrTicketCard';
import { bookingCode, fmtDayLong, fmtTime, fmtTimeRange, isUpcoming, langOf } from '../lib';
import { ScreenHeader } from '../MemberLayout';
import {
  downloadBookingCalendar,
  useAcceptOffer,
  useCancelBooking,
  useLeaveWaitlist,
  useMyBookings,
  useMyWaitlist,
} from '../queries';

const STATUS_TONE: Record<Booking['status'], BadgeTone> = {
  active: 'brand',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
};

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function BookingRow({ booking, onCancel }: { booking: Booking; onCancel?: (b: Booking) => void }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const [qrOpen, setQrOpen] = useState(false);
  const upcoming = isUpcoming(booking);
  const code = bookingCode(booking);

  return (
    <li>
      <Card className="border border-line/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{booking.resource_name}</p>
            <p className="mt-0.5 text-xs font-medium capitalize text-muted">
              {fmtDayLong(booking.start, lang)} · {fmtTimeRange(booking.start, booking.end)}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">{code}</p>
          </div>
          <Badge tone={STATUS_TONE[booking.status]}>{t(`user.bookings.status.${booking.status}`)}</Badge>
        </div>
        {booking.status === 'cancelled' && booking.cancel_reason && (
          <p className="mt-2 text-xs text-muted">{t('user.bookings.cancelReason', { reason: booking.cancel_reason })}</p>
        )}
        {booking.checked_in_at && <p className="mt-2 text-xs font-semibold text-success-ink">{t('user.bookings.checkedIn')}</p>}
        {upcoming && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="accent" leftIcon={<QrCode size={16} aria-hidden />} onClick={() => setQrOpen(true)}>
              {t('user.bookings.showQr')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<CalendarPlus size={16} aria-hidden />}
              onClick={() =>
                downloadBookingCalendar(booking.id, code).catch(() => toast.error(t('user.confirm.success.calendarFailed')))
              }
            >
              {t('user.bookings.calendar')}
            </Button>
            {onCancel && (
              <Button size="sm" variant="ghost" leftIcon={<X size={16} aria-hidden />} onClick={() => onCancel(booking)}>
                {t('user.bookings.cancel')}
              </Button>
            )}
          </div>
        )}
      </Card>
      {upcoming && <QrPassModal booking={booking} open={qrOpen} onOpenChange={setQrOpen} />}
    </li>
  );
}

function BookingList({ scope }: { scope: 'upcoming' | 'history' }) {
  const { t } = useTranslation();
  const bookings = useMyBookings(scope);
  const cancel = useCancelBooking();
  const [toCancel, setToCancel] = useState<Booking | null>(null);

  if (bookings.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
      </div>
    );
  }
  if (bookings.isError) return <ErrorState onRetry={() => void bookings.refetch()} />;
  const items = [...bookings.data.items].sort((a, b) =>
    scope === 'upcoming' ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start),
  );
  if (items.length === 0) {
    return <EmptyState title={t(`user.bookings.empty.${scope}`)} description={scope === 'upcoming' ? t('user.bookings.empty.hint') : undefined} />;
  }

  return (
    <>
      <ul className="space-y-3">
        {items.map((b) => (
          <BookingRow key={b.id} booking={b} onCancel={scope === 'upcoming' ? setToCancel : undefined} />
        ))}
      </ul>
      <Modal
        open={!!toCancel}
        onOpenChange={(o) => {
          if (!o) {
            setToCancel(null);
            cancel.reset();
          }
        }}
        tone="danger"
        size="sm"
        title={t('user.bookings.cancelTitle')}
        description={toCancel ? `${toCancel.resource_name} · ${fmtTimeRange(toCancel.start, toCancel.end)}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setToCancel(null)}>
              {t('common.back')}
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() =>
                toCancel &&
                cancel.mutate(toCancel.id, {
                  onSuccess: (res) => {
                    toast.success(res.quota_refunded ? t('user.bookings.cancelledRefunded') : t('user.bookings.cancelledNoRefund'));
                    setToCancel(null);
                  },
                })
              }
            >
              {t('user.bookings.cancelConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('user.bookings.cancelBody')}</p>
        {cancel.isError && (
          <p role="alert" className="mt-3 text-sm font-semibold text-danger-ink">
            {errorMessage(cancel.error, t('errors.generic'))}
          </p>
        )}
      </Modal>
    </>
  );
}

function WaitlistRow({ entry }: { entry: WaitlistEntry }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const leave = useLeaveWaitlist();
  const accept = useAcceptOffer();
  const slot = entry.offered_slot ?? (entry.start && entry.end ? { start: entry.start, end: entry.end } : null);

  return (
    <li>
      <Card className="border border-line/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold capitalize text-ink">{fmtDayLong(slot?.start ?? `${entry.day}T10:00:00Z`, lang)}</p>
            <p className="mt-0.5 text-xs text-muted">{slot ? fmtTimeRange(slot.start, slot.end) : t('user.waitlist.anySlot')}</p>
          </div>
          <Badge tone={entry.status === 'offered' ? 'warn' : 'neutral'}>{t(`user.waitlist.status.${entry.status}`)}</Badge>
        </div>
        {entry.status === 'offered' && entry.offer_expires_at && (
          <p className="mt-2 text-xs font-semibold text-warn-ink">
            {t('user.waitlist.offerExpires', { time: fmtTime(entry.offer_expires_at) })}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.status === 'offered' && (
            <Button
              size="sm"
              variant="accent"
              loading={accept.isPending}
              onClick={() => accept.mutate(entry.id, { onSuccess: () => toast.success(t('user.waitlist.accepted')) })}
            >
              {t('user.waitlist.accept')}
            </Button>
          )}
          {(entry.status === 'waiting' || entry.status === 'offered') && (
            <Button size="sm" variant="ghost" loading={leave.isPending} onClick={() => leave.mutate(entry.id)}>
              {t('user.waitlist.leave')}
            </Button>
          )}
        </div>
        {(accept.isError || leave.isError) && (
          <p role="alert" className="mt-2 text-xs font-semibold text-danger-ink">
            {errorMessage(accept.error ?? leave.error, t('errors.generic'))}
          </p>
        )}
      </Card>
    </li>
  );
}

function WaitlistSection() {
  const { t } = useTranslation();
  const waitlist = useMyWaitlist();
  const entries = (waitlist.data ?? []).filter((e) => e.status === 'waiting' || e.status === 'offered');
  if (!waitlist.isSuccess || entries.length === 0) return null;
  return (
    <section aria-labelledby="waitlist-title" className="mb-5">
      <h2 id="waitlist-title" className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">
        {t('user.waitlist.title')}
      </h2>
      <ul className="space-y-3">
        {entries.map((e) => (
          <WaitlistRow key={e.id} entry={e} />
        ))}
      </ul>
    </section>
  );
}

/** Rezervările mele (FR-12, FR-13) și lista de așteptare (FR-27). */
export default function MyBookingsPage() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 pb-6">
      <ScreenHeader eyebrow={t('user.bookings.eyebrow')} title={t('user.bookings.title')} />
      <div className="px-4 pt-2">
        <WaitlistSection />
        <Tabs defaultValue="upcoming">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="upcoming" className="flex-1">
              {t('user.bookings.upcoming')}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              {t('user.bookings.history')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming">
            <BookingList scope="upcoming" />
          </TabsContent>
          <TabsContent value="history">
            <BookingList scope="history" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
