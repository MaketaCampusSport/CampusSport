import { useState } from 'react';
import { Calendar, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

export interface ActiveReservation {
  id: string;
  code: string;
  qrToken?: string;
  sportName: string;
  resourceName: string;
  locationLabel: string;
  dayShort: string;
  dayNumber: string;
  dateLabel: string;
  timeSlot: string;
  checkInWindow: string;
}

interface QrTicketCardProps {
  reservation: ActiveReservation;
}

/**
 * Compact "Următoarea rezervare" card matching UI Design page 16,
 * with a yellow QR trigger opening the full-screen access pass (page 13).
 */
export default function QrTicketCard({ reservation }: QrTicketCardProps) {
  const [isQrOpen, setIsQrOpen] = useState(false);
  const qrValue = reservation.qrToken ?? reservation.code;

  return (
    <>
      {/* UI-02: Compact upcoming reservation card (UI Design page 16) */}
      <Card
        aria-label="Următoarea rezervare"
        className="flex items-center gap-3 border border-line/60 p-3.5"
      >
        {/* Blue date badge (e.g., JOI / 24) */}
        <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand text-white">
          <span className="text-[10px] font-bold uppercase leading-none tracking-wider opacity-90">
            {reservation.dayShort}
          </span>
          <span className="heading mt-0.5 text-2xl leading-tight">
            {reservation.dayNumber}
          </span>
        </div>

        {/* Yellow QR quick-action button (min 44x44px touch target - UI-05) */}
        <button
          type="button"
          onClick={() => setIsQrOpen(true)}
          aria-label={`Deschide codul QR pentru ${reservation.sportName} ${reservation.resourceName}`}
          className="flex h-12 w-12 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-2xl bg-sun text-onsun shadow-card transition-colors hover:bg-sun-hover active:scale-95"
        >
          <QrCode size={24} strokeWidth={2.25} />
        </button>

        {/* Reservation summary */}
        <button
          type="button"
          onClick={() => setIsQrOpen(true)}
          className="min-w-0 flex-1 py-0.5 text-left"
        >
          <p className="text-[11px] font-medium leading-tight text-muted">
            Următoarea rezervare
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-ink">
            {reservation.sportName} · {reservation.resourceName}
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {reservation.timeSlot}
          </p>
        </button>
      </Card>

      {/* Full QR Access Pass Modal (UI Kit Radix Modal) */}
      <Modal
        open={isQrOpen}
        onOpenChange={setIsQrOpen}
        size="sm"
        title="Codul tău de acces"
        description={`${reservation.sportName} · ${reservation.resourceName}`}
      >
        <div className="mb-4 rounded-2xl border border-line bg-subtle p-3.5">
          <div className="flex items-center justify-between text-xs font-bold text-brand-text">
            <span className="uppercase">{reservation.sportName}</span>
            <span className="font-mono text-muted">{reservation.code}</span>
          </div>
          <p className="mt-0.5 text-base font-bold text-ink">
            {reservation.resourceName} · {reservation.locationLabel}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <Calendar size={13} className="text-brand-text" />
            <span>
              {reservation.dateLabel} · {reservation.timeSlot}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-2">
          <div className="rounded-2xl bg-white p-3">
            <QRCode
              value={qrValue}
              size={192}
              fgColor="#1A2238"
              bgColor="#FFFFFF"
              aria-label={`Cod QR rezervare ${reservation.code}`}
            />
          </div>
          <p className="mt-2 font-mono text-sm font-bold text-ink">
            {reservation.code}
          </p>
        </div>

        <div className="mt-3 rounded-2xl bg-brand-soft p-3 text-left">
          <p className="text-xs font-bold text-brand-text">
            Check-in: {reservation.checkInWindow}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink/80">
            Arată codul QR personalului de la intrare (-10/+15 min față de ora rezervării).
          </p>
        </div>
      </Modal>
    </>
  );
}