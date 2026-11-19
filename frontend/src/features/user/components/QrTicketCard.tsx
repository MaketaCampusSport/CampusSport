import { useQuery } from '@tanstack/react-query';
import { Calendar, QrCode } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-qr-code';
import { client } from '@/api/client';
import type { Booking } from '@/api/generated';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/Modal';
import { bookingCode, checkInWindow, fmtDayLong, fmtDayNumber, fmtTimeRange, fmtWeekdayShort, langOf } from '../lib';

/** Codul QR al rezervării (semnat de server; valabil doar în ziua rezervării – FR-03, NFR-09). */
export function QrPassModal({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const code = bookingCode(booking);
  // Lista de rezervări poate omite tokenul; detaliul îl include pentru titular.
  const detail = useQuery({
    queryKey: ['member', 'booking', booking.id],
    queryFn: () => client.bookings.get(booking.id),
    enabled: open && !booking.qr_token,
  });
  const token = booking.qr_token ?? detail.data?.qr_token;

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title={t('user.qr.title')} description={booking.resource_name}>
      <div className="mb-4 rounded-2xl border border-line bg-subtle p-3.5">
        <div className="flex items-center justify-between text-xs font-bold text-brand-text">
          <span className="uppercase">{booking.resource_name}</span>
          <span className="font-mono text-muted">{code}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <Calendar size={13} className="text-brand-text" aria-hidden />
          <span className="capitalize">
            {fmtDayLong(booking.start, lang)} · {fmtTimeRange(booking.start, booking.end)}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-2">
        <div className="flex h-[216px] w-[216px] items-center justify-center rounded-2xl bg-white p-3">
          {token ? (
            <QRCode value={token} size={192} fgColor="#1A2238" bgColor="#FFFFFF" aria-label={t('user.qr.aria', { code })} />
          ) : detail.isError ? (
            <p className="text-center text-xs font-semibold text-danger-ink">{t('user.qr.unavailable')}</p>
          ) : (
            <Spinner className="h-6 w-6" />
          )}
        </div>
        <p className="mt-2 font-mono text-sm font-bold text-ink">{code}</p>
      </div>

      <div className="mt-3 rounded-2xl bg-brand-soft p-3 text-left">
        <p className="text-xs font-bold text-brand-text">{t('user.qr.window', { window: checkInWindow(booking.start) })}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-ink/80">{t('user.qr.hint')}</p>
      </div>
    </Modal>
  );
}

/** Cardul compact „Următoarea rezervare” (UI Design p. 16), cu butonul galben pentru QR. */
export default function QrTicketCard({ booking }: { booking: Booking }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card aria-label={t('user.qr.next')} className="flex items-center gap-3 border border-line/60 p-3.5">
        <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand text-white">
          <span className="text-[10px] font-bold uppercase leading-none tracking-wider opacity-90">{fmtWeekdayShort(booking.start, lang)}</span>
          <span className="heading mt-0.5 text-2xl leading-tight">{fmtDayNumber(booking.start)}</span>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('user.qr.openAria', { name: booking.resource_name })}
          className="flex h-12 w-12 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-2xl bg-sun text-onsun shadow-card transition-colors hover:bg-sun-hover active:scale-95"
        >
          <QrCode size={24} strokeWidth={2.25} aria-hidden />
        </button>

        <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 py-0.5 text-left">
          <p className="text-[11px] font-medium leading-tight text-muted">{t('user.qr.next')}</p>
          <p className="mt-0.5 truncate text-sm font-bold text-ink">{booking.resource_name}</p>
          <p className="mt-0.5 text-xs font-medium text-muted">{fmtTimeRange(booking.start, booking.end)}</p>
        </button>
      </Card>
      <QrPassModal booking={booking} open={open} onOpenChange={setOpen} />
    </>
  );
}
