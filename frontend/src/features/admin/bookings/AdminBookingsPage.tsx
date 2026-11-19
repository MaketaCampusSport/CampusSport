import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { client, type Booking, type BookingStatus, type ListBookingsData } from '@/api/client';
import { keys } from '@/api/keys';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { fmtShortDay, fmtTime, toDateKey } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { errorMessage } from '../shared/errors';
import { Pagination } from '../shared/Pagination';
import { useResources } from '../shared/queries';

const STATUSES: BookingStatus[] = ['active', 'completed', 'no_show', 'cancelled'];
const STATUS_TONE: Record<BookingStatus, BadgeTone> = { active: 'brand', completed: 'success', no_show: 'danger', cancelled: 'neutral' };
const PAGE_SIZE = 20;

/**
 * Titularii rezervărilor dintr-o zi. `Booking` are doar `user_id`; numele vin din grila panoului
 * (`holder_name` + `booking_id`, vizibile pentru admin).
 */
function useHolderNames(date: string) {
  return useQuery({
    queryKey: keys.dashboard(date),
    queryFn: () => client.admin.dashboard(date),
    enabled: !!date,
    select: (d) => new Map(d.resources.flatMap((r) => r.slots).filter((s) => s.booking_id && s.holder_name).map((s) => [s.booking_id as string, s.holder_name as string])),
  });
}

/** Rezervările tuturor utilizatorilor, cu filtre, și anularea de către administrator (FR-43, FR-27, FR-35). */
export default function AdminBookingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const resources = useResources();
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [resource, setResource] = useState('');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Booking | null>(null);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const query: ListBookingsData['query'] = {
    ...(date ? { date } : {}),
    ...(resource ? { resource } : {}),
    ...(status ? { status } : {}),
    page,
    page_size: PAGE_SIZE,
  };
  const bookings = useQuery({ queryKey: keys.adminBookings(query), queryFn: () => client.admin.bookings(query), placeholderData: keepPreviousData });
  const holders = useHolderNames(date);

  const cancel = useMutation({
    mutationFn: (v: { id: string; reason: string }) => client.admin.cancelBooking(v.id, v.reason),
    onSuccess: async (res) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.adminBookingsAll }),
        qc.invalidateQueries({ queryKey: keys.dashboardAll }),
        qc.invalidateQueries({ queryKey: keys.auditAll }),
      ]);
      toast.success(
        t('adminBookings.toast.cancelled', { name: res.booking.resource_name }),
        res.quota_refunded ? t('adminBookings.toast.refunded') : undefined,
      );
      setTarget(null);
    },
  });

  function openCancel(b: Booking) {
    setTarget(b);
    setReason('');
    setSubmitted(false);
    cancel.reset();
  }

  const reasonOk = reason.trim().length > 0;
  const d = bookings.data;
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title={t('adminBookings.title')} subtitle={t('adminBookings.subtitle')} />

      <div className="mb-4 grid grid-cols-[200px_minmax(0,1fr)_200px] gap-4">
        <Field label={t('adminBookings.filters.date')} srOnlyLabel>
          {(c) => <Input {...c} type="date" value={date} onChange={(e) => filter(setDate)(e.target.value)} />}
        </Field>
        <Field label={t('adminBookings.filters.resource')} srOnlyLabel>
          {(c) => (
            <Select {...c} value={resource} onChange={(e) => filter(setResource)(e.target.value)}>
              <option value="">{t('adminBookings.filters.allResources')}</option>
              {(resources.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('adminBookings.filters.status')} srOnlyLabel>
          {(c) => (
            <Select {...c} value={status} onChange={(e) => filter(setStatus)(e.target.value as BookingStatus | '')}>
              <option value="">{t('adminBookings.filters.allStatuses')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`adminBookings.status.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {bookings.isError ? (
        <ErrorState message={bookings.error.message} onRetry={() => void bookings.refetch()} />
      ) : !d ? (
        <Skeleton className="h-[420px] rounded-3xl" />
      ) : d.items.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarCheck className="h-6 w-6" aria-hidden />} title={t('adminBookings.emptyTitle')} description={t('adminBookings.emptyBody')} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="table-head pl-6">{t('adminBookings.col.when')}</th>
                <th scope="col" className="table-head">{t('adminBookings.col.resource')}</th>
                <th scope="col" className="table-head">{t('adminBookings.col.holder')}</th>
                <th scope="col" className="table-head">{t('adminBookings.col.status')}</th>
                <th scope="col" className="table-head pr-6 text-right">{t('adminBookings.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-b-0">
                  <td className="whitespace-nowrap py-3 pl-6 pr-3 text-[15px] text-ink">
                    <span className="font-bold">{fmtShortDay(b.start)}</span> · {fmtTime(b.start)}–{fmtTime(b.end)}
                  </td>
                  <td className="px-4 py-3 text-[15px] text-ink">{b.resource_name}</td>
                  <td className="px-4 py-3 text-[15px] text-muted">
                    {holders.data?.get(b.id) ?? (b.user_id ? t('adminBookings.userId', { id: b.user_id.slice(0, 8) }) : t('adminBookings.anonymized'))}
                    {b.participants_count && b.participants_count > 1 ? (
                      <span className="block text-xs">{t('adminBookings.participants', { count: b.participants_count })}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[b.status]}>{t(`adminBookings.status.${b.status}`)}</Badge>
                    {b.checked_in_at && <p className="mt-1 text-xs text-muted">{t('adminBookings.checkedIn', { time: fmtTime(b.checked_in_at) })}</p>}
                    {b.status === 'cancelled' && b.cancel_reason && <p className="mt-1 text-xs text-muted">{b.cancel_reason}</p>}
                  </td>
                  <td className="py-3 pl-4 pr-6 text-right">
                    {b.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<XCircle className="h-4 w-4" aria-hidden />}
                        onClick={() => openCancel(b)}
                        aria-label={`${t('adminBookings.cancel')} ${b.resource_name} ${fmtTime(b.start)}`}
                      >
                        {t('adminBookings.cancel')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination meta={d} onPage={setPage} />
        </Card>
      )}

      <Modal
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        size="sm"
        tone="danger"
        title={t('adminBookings.cancelTitle')}
        description={target ? `${target.resource_name} · ${fmtShortDay(target.start)} · ${fmtTime(target.start)}–${fmtTime(target.end)}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setTarget(null)}>
              {t('common.cancelAction')}
            </Button>
            <Button type="submit" form="cancel-booking-form" variant="danger" loading={cancel.isPending}>
              {t('adminBookings.cancelConfirm')}
            </Button>
          </>
        }
      >
        <form
          id="cancel-booking-form"
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (target && reasonOk) cancel.mutate({ id: target.id, reason: reason.trim() });
          }}
        >
          <p className="text-sm text-muted">{t('adminBookings.cancelBody')}</p>
          <Field label={t('adminBookings.fields.reason')} error={submitted && !reasonOk ? t('adminBookings.errors.reason') : undefined}>
            {(c) => <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
          </Field>
          {cancel.isError && (
            <p role="alert" className="text-sm font-semibold text-danger-ink">
              {errorMessage(cancel.error, t)}
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
