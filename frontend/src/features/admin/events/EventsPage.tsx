import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { client, type BookingConflict, type ConflictsError, type EventCreate } from '@/api/client';
import { ApiError } from '@/api/http';
import { keys } from '@/api/keys';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { addDays, fmtDayTime, fromLocalInput, timeToMinutes, toDateKey } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { errorMessage } from '../shared/errors';
import { activeResources, useResources } from '../shared/queries';

/** Serverul răspunde încă 501 NOT_IMPLEMENTED pe POST /admin/events (backend/README.md). */
const SERVER_READY = false;

/**
 * Evenimente universitare (FR-21): rezervă o resursă oricât de departe în viitor.
 * Dacă există rezervări suprapuse, serverul răspunde 409 cu lista lor; retrimiterea cu
 * `confirm_conflicts: true` le anulează. Contractul nu are o listă a evenimentelor (apar în Blocări).
 */
export default function EventsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const resources = useResources();
  const options = activeResources(resources.data);
  const [name, setName] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [date, setDate] = useState(() => toDateKey(addDays(new Date(), 7)));
  const [from, setFrom] = useState('18:00');
  const [to, setTo] = useState('21:00');
  const [submitted, setSubmitted] = useState(false);
  const [conflicts, setConflicts] = useState<BookingConflict[] | null>(null);

  const effectiveResource = resourceId || options[0]?.id || '';
  const errors = {
    name: !name.trim() ? t('events.errors.name') : undefined,
    resource: !effectiveResource ? t('events.errors.resources') : undefined,
    date: !date ? t('events.errors.date') : undefined,
    time: timeToMinutes(to) <= timeToMinutes(from) ? t('events.errors.time') : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const input: EventCreate = {
    resource_id: effectiveResource,
    reason: name.trim(),
    start: fromLocalInput(`${date}T${from}`).toISOString(),
    end: fromLocalInput(`${date}T${to}`).toISOString(),
  };

  const create = useMutation({
    mutationFn: (i: EventCreate) => client.admin.createEvent(i),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: keys.blocksAll });
      void qc.invalidateQueries({ queryKey: keys.dashboardAll });
      void qc.invalidateQueries({ queryKey: keys.auditAll });
      toast.success(t('events.toast.created', { name: res.block.reason }), t('events.toast.cancelled', { count: res.cancelled_bookings_count }));
      setName('');
      setConflicts(null);
      setSubmitted(false);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CONFLICTS_NEED_CONFIRMATION') setConflicts((e.body as ConflictsError | undefined)?.conflicts ?? []);
    },
  });

  function submit(confirm: boolean) {
    setSubmitted(true);
    if (!SERVER_READY || invalid) return;
    create.mutate({ ...input, ...(confirm ? { confirm_conflicts: true } : {}) });
  }

  const showError = create.isError && !(create.error instanceof ApiError && create.error.code === 'CONFLICTS_NEED_CONFIRMATION');

  return (
    <>
      <PageHeader title={t('events.title')} subtitle={t('events.subtitle')} />
      {!SERVER_READY && (
        <Banner tone="info" role="status" className="mb-6" title={t('common.notAvailableTitle')}>
          {t('common.notAvailableBody')}
        </Banner>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6">
        <Card className="p-6">
          <form
            noValidate
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
          >
            <h2 className="heading text-lg">{t('events.new')}</h2>
            <Field label={t('events.fields.name')} error={submitted ? errors.name : undefined}>
              {(c) => (
                <Input
                  {...c}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setConflicts(null);
                  }}
                  maxLength={120}
                />
              )}
            </Field>
            <Field label={t('events.fields.resource')} error={submitted ? errors.resource : undefined}>
              {(c) => (
                <Select
                  {...c}
                  value={effectiveResource}
                  onChange={(e) => {
                    setResourceId(e.target.value);
                    setConflicts(null);
                  }}
                >
                  {options.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <Field label={t('events.fields.date')} error={submitted ? errors.date : undefined}>
                {(c) => <Input {...c} type="date" value={date} onChange={(e) => { setDate(e.target.value); setConflicts(null); }} />}
              </Field>
              <Field label={t('events.fields.from')}>
                {(c) => <Input {...c} type="time" value={from} onChange={(e) => { setFrom(e.target.value); setConflicts(null); }} />}
              </Field>
              <Field label={t('events.fields.to')} error={submitted ? errors.time : undefined}>
                {(c) => <Input {...c} type="time" value={to} onChange={(e) => { setTo(e.target.value); setConflicts(null); }} />}
              </Field>
            </div>

            {conflicts && (
              <div className="space-y-3" aria-live="polite">
                <Banner tone="warn" role="alert" title={t('events.conflicts', { count: conflicts.length })}>
                  {t('events.conflictsBody')}
                </Banner>
                <ul className="divide-y divide-line rounded-2xl bg-subtle px-4">
                  {conflicts.map((c) => (
                    <li key={c.booking_id} className="flex justify-between py-2 text-sm">
                      <span className="font-semibold text-ink">{c.holder_name ?? '—'}</span>
                      <span className="text-muted">{fmtDayTime(c.start)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showError && (
              <p role="alert" className="text-sm font-semibold text-danger-ink">
                {errorMessage(create.error, t)}
              </p>
            )}

            {conflicts ? (
              <Button
                variant="danger"
                size="lg"
                loading={create.isPending}
                disabled={!SERVER_READY}
                leftIcon={<AlertTriangle className="h-5 w-5" aria-hidden />}
                onClick={() => submit(true)}
              >
                {t('events.confirmConflicts', { count: conflicts.length })}
              </Button>
            ) : (
              <Button
                type="submit"
                variant="accent"
                size="lg"
                loading={create.isPending}
                disabled={!SERVER_READY}
                leftIcon={<CalendarPlus className="h-5 w-5" aria-hidden />}
              >
                {t('events.create')}
              </Button>
            )}
          </form>
        </Card>
        <Card className="p-6">
          <h2 className="heading text-lg">{t('events.howTitle')}</h2>
          <p className="mt-2 text-sm text-muted">{t('events.howBody')}</p>
        </Card>
      </div>
    </>
  );
}
