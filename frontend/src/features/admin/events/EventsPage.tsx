import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { keys } from '@/api/keys';
import type { EventInput, EventRecurrence } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, toggleInList } from '@/components/ui/Chip';
import { Banner, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { addDays, fmtLongDay, fmtTime, timeToMinutes, toDateKey } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { useResources } from '../shared/queries';

/** Evenimente universitare (FR-44): rezervă resursele și anulează rezervările în conflict. */
export default function EventsPage() {
  const { t } = useTranslation();
  const events = useQuery({ queryKey: keys.events, queryFn: () => api.events.list() });
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={t('events.title')}
        subtitle={t('events.subtitle')}
        actions={<Button variant="accent" size="lg" leftIcon={<CalendarPlus className="h-5 w-5" aria-hidden />} onClick={() => setOpen(true)}>{t('events.new')}</Button>}
      />
      {events.isError ? (
        <ErrorState message={events.error.message} onRetry={() => void events.refetch()} />
      ) : events.isPending ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : events.data.length === 0 ? (
        <Card><EmptyState icon={<Star className="h-6 w-6" aria-hidden />} title={t('events.emptyTitle')} description={t('events.emptyBody')} /></Card>
      ) : (
        <ul className="grid grid-cols-2 gap-5">
          {events.data.map((e) => (
            <li key={e.id}>
              <Card className="flex gap-4 p-5">
                <ResourceThumb src={e.photoUrl} className="h-24 w-24 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="heading text-lg leading-tight">{e.name}</h2>
                  <p className="mt-1 text-sm text-muted">{e.resourceNames.join(', ')}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {fmtLongDay(e.startsAt)} · {fmtTime(e.startsAt)}–{fmtTime(e.endsAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {e.recurrence !== 'none' && <Badge tone="brand">{t(`events.recurrence.${e.recurrence}`)}</Badge>}
                    <Badge tone={e.cancelledCount > 0 ? 'warn' : 'success'}>{t('events.cancelled', { count: e.cancelledCount })}</Badge>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <EventDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function EventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const resources = useResources();
  const [name, setName] = useState('');
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [date, setDate] = useState(() => toDateKey(addDays(new Date(), 7)));
  const [from, setFrom] = useState('18:00');
  const [to, setTo] = useState('21:00');
  const [recurrence, setRecurrence] = useState<EventRecurrence>('none');
  const [submitted, setSubmitted] = useState(false);

  const input: EventInput = { name: name.trim(), resourceIds, date, from, to, recurrence };
  const errors = {
    name: !name.trim() ? t('events.errors.name') : undefined,
    resources: resourceIds.length === 0 ? t('events.errors.resources') : undefined,
    date: !date ? t('events.errors.date') : undefined,
    time: timeToMinutes(to) <= timeToMinutes(from) ? t('events.errors.time') : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const previewPayload = useMemo(() => (resourceIds.length && date && !errors.time ? { resourceIds, date, from, to, recurrence, name: '' } : null), [resourceIds, date, from, to, recurrence, errors.time]);
  const preview = useQuery({
    queryKey: keys.eventPreview(previewPayload),
    queryFn: () => api.events.preview(previewPayload as EventInput),
    enabled: open && !!previewPayload,
  });
  const create = useMutation({
    mutationFn: (i: EventInput) => api.events.create(i),
    onSuccess: (ev) => {
      void qc.invalidateQueries({ queryKey: keys.events });
      void qc.invalidateQueries({ queryKey: keys.dashboardAll });
      void qc.invalidateQueries({ queryKey: keys.auditAll });
      toast.success(t('events.toast.created', { name: ev.name }), t('events.toast.cancelled', { count: ev.cancelledCount }));
      setName(''); setResourceIds([]); setSubmitted(false);
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      tone="brand"
      icon={<Star className="h-7 w-7" aria-hidden />}
      title={t('events.new')}
      description={t('events.dialogSubtitle')}
      footer={
        <>
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>{t('common.cancelAction')}</Button>
          <Button variant="accent" size="lg" className="flex-1" loading={create.isPending} onClick={() => { setSubmitted(true); if (!invalid) create.mutate(input); }}>
            {t('events.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label={t('events.fields.name')} error={submitted ? errors.name : undefined}>
          {(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">{t('events.fields.resources')}</legend>
          <div className="flex flex-wrap gap-2">
            {(resources.data ?? []).filter((r) => r.active).map((r) => (
              <Chip key={r.id} pressed={resourceIds.includes(r.id)} onPressedChange={(on) => setResourceIds(toggleInList(resourceIds, r.id, on))}>{r.name}</Chip>
            ))}
          </div>
          {submitted && errors.resources && <p role="alert" className="mt-2 text-xs font-semibold text-danger-ink">{errors.resources}</p>}
        </fieldset>
        <div className="grid grid-cols-3 gap-4">
          <Field label={t('events.fields.date')} error={submitted ? errors.date : undefined}>{(c) => <Input {...c} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label={t('events.fields.from')}>{(c) => <Input {...c} type="time" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label={t('events.fields.to')} error={submitted ? errors.time : undefined}>{(c) => <Input {...c} type="time" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        <Field label={t('events.fields.recurrence')}>
          {(c) => (
            <Select {...c} value={recurrence} onChange={(e) => setRecurrence(e.target.value as EventRecurrence)}>
              {(['none', 'weekly', 'monthly'] as EventRecurrence[]).map((r) => <option key={r} value={r}>{t(`events.recurrence.${r}`)}</option>)}
            </Select>
          )}
        </Field>
        <div aria-live="polite">
          {preview.data ? (
            preview.data.conflictCount > 0 ? (
              <Banner tone="warn" title={t('events.conflicts', { count: preview.data.conflictCount })}>{t('events.conflictsBody')}</Banner>
            ) : (
              <Banner tone="success" title={t('events.noConflicts')} />
            )
          ) : previewPayload ? <Skeleton className="h-14" /> : null}
        </div>
        {create.isError && <p role="alert" className="text-sm font-semibold text-danger-ink">{create.error instanceof ApiError ? create.error.message : t('errors.generic')}</p>}
      </div>
    </Modal>
  );
}
