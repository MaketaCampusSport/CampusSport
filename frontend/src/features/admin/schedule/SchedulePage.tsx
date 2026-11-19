import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { client, type BookingConflict, type ConflictsError, type ScheduleClassCreate } from '@/api/client';
import { ApiError } from '@/api/http';
import { keys } from '@/api/keys';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, toggleInList } from '@/components/ui/Chip';
import { Banner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/cn';
import { addDays, fmtDayTime, fromDateKey, fromLocalInput, timeToMinutes, toDateKey } from '@/lib/dates';
import { ISO_WEEKDAYS, type IsoWeekday } from '@/lib/validators';
import { errorMessage } from '../shared/errors';
import { activeResources, resourceName, useResources } from '../shared/queries';
import { useScheduleWizardStore } from './wizardStore';

/** Serverul răspunde încă 501 NOT_IMPLEMENTED pe rutele /admin/schedule/* (backend/README.md). */
const SERVER_READY = false;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = '.csv,.ics';
const BYDAY: Record<IsoWeekday, string> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };

interface ManualClass {
  resourceId: string;
  courseName: string;
  weekdays: IsoWeekday[];
  from: string;
  to: string;
  validFrom: string;
  validTo: string;
}

/** Ora manuală → `ScheduleClassCreate`: prima apariție + regula RRULE săptămânală. */
export function toScheduleClass(m: ManualClass): ScheduleClassCreate {
  let first = fromDateKey(m.validFrom);
  for (let i = 0; i < 7 && !m.weekdays.includes(((first.getDay() + 6) % 7) + 1 as IsoWeekday); i++) first = addDays(first, 1);
  const day = toDateKey(first);
  return {
    resource_id: m.resourceId,
    reason: m.courseName.trim(),
    first_start: fromLocalInput(`${day}T${m.from}`).toISOString(),
    first_end: fromLocalInput(`${day}T${m.to}`).toISOString(),
    recurrence: { rule: `FREQ=WEEKLY;BYDAY=${m.weekdays.map((d) => BYDAY[d]).join(',')}`, valid_from: m.validFrom, valid_to: m.validTo },
  };
}

/** Orar Educație Fizică (FR-19, SDD 7.4): încarcă → verifică conflictele → confirmă. */
export default function SchedulePage() {
  const { t } = useTranslation();
  const wizard = useScheduleWizardStore();
  const steps = ['upload', 'check', 'done'] as const;

  return (
    <>
      <PageHeader title={t('schedule.title')} subtitle={t('schedule.subtitle')} />
      {!SERVER_READY && (
        <Banner tone="info" role="status" className="mb-6" title={t('common.notAvailableTitle')}>
          {t('common.notAvailableBody')}
        </Banner>
      )}
      <ol className="mb-6 flex gap-3" aria-label={t('schedule.title')}>
        {steps.map((s, i) => {
          const n = i + 1;
          const state = wizard.step === n ? 'current' : wizard.step > n ? 'done' : 'todo';
          return (
            <li
              key={s}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold',
                state === 'current' ? 'bg-navy text-white' : state === 'done' ? 'bg-success-soft text-success-ink' : 'bg-surface text-muted shadow-card',
              )}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">{n}</span>
              {t(`schedule.steps.${s}`)}
            </li>
          );
        })}
      </ol>
      {wizard.step === 1 && <UploadStep />}
      {wizard.step === 2 && wizard.pending && <CheckStep />}
      {wizard.step === 3 && wizard.result && <DoneStep />}
    </>
  );
}

function useInvalidateAfterImport() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.blocksAll });
    void qc.invalidateQueries({ queryKey: keys.dashboardAll });
    void qc.invalidateQueries({ queryKey: keys.auditAll });
  };
}

function UploadStep() {
  const { t } = useTranslation();
  const setPending = useScheduleWizardStore((s) => s.setPending);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<'file' | 'manual'>('file');
  const today = new Date();
  const [validFrom, setValidFrom] = useState(toDateKey(today));
  const [validTo, setValidTo] = useState(toDateKey(addDays(today, 98)));

  const upload = useMutation({
    mutationFn: (f: File) => {
      const form = new FormData();
      form.append('file', f);
      form.append('valid_from', validFrom);
      form.append('valid_to', validTo);
      return client.admin.importSchedule(form);
    },
    onSuccess: (preview) => setPending({ kind: 'file', preview }),
  });

  function pick(file: File | undefined) {
    setFileError(null);
    if (!file || !SERVER_READY) return;
    if (!/\.(csv|ics)$/i.test(file.name)) return setFileError(t('schedule.errors.type'));
    if (file.size > MAX_BYTES) return setFileError(t('schedule.errors.size'));
    if (validTo < validFrom) return setFileError(t('schedule.errors.range'));
    upload.mutate(file);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files[0]);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_420px] items-start gap-6">
      <Card className="p-6">
        <div className="mb-4 flex gap-2">
          <Chip pressed={mode === 'file'} onPressedChange={() => setMode('file')}>
            {t('schedule.modeFile')}
          </Chip>
          <Chip pressed={mode === 'manual'} onPressedChange={() => setMode('manual')}>
            {t('schedule.modeManual')}
          </Chip>
        </div>
        {mode === 'file' ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4">
              <Field label={t('schedule.validFrom')}>{(c) => <Input {...c} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />}</Field>
              <Field label={t('schedule.validTo')}>{(c) => <Input {...c} type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />}</Field>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors',
                drag ? 'border-brand bg-brand-soft' : 'border-line bg-subtle',
              )}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-brand-text shadow-card">
                <FileSpreadsheet className="h-7 w-7" aria-hidden />
              </div>
              <p className="heading text-lg">{t('schedule.drop')}</p>
              <p className="text-sm text-muted">{t('schedule.dropHint')}</p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                aria-label={t('schedule.choose')}
                disabled={!SERVER_READY}
                onChange={(e) => pick(e.target.files?.[0])}
              />
              <Button
                variant="accent"
                size="md"
                loading={upload.isPending}
                disabled={!SERVER_READY}
                leftIcon={<Upload className="h-4 w-4" aria-hidden />}
                onClick={() => inputRef.current?.click()}
              >
                {t('schedule.choose')}
              </Button>
            </div>
            {(fileError || upload.isError) && (
              <p role="alert" className="mt-3 text-sm font-semibold text-danger-ink">
                {fileError ?? errorMessage(upload.error, t)}
              </p>
            )}
          </>
        ) : (
          <ManualForm />
        )}
      </Card>

      <Card className="p-6">
        <h2 className="heading text-lg">{t('schedule.formatTitle')}</h2>
        <p className="mt-2 text-sm text-muted">{t('schedule.formatBody')}</p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              {['resource_id', 'weekday', 'start_time', 'end_time', 'group'].map((c) => (
                <th key={c} scope="col" className="py-2 pr-2 font-mono text-xs font-bold text-muted">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-2 font-mono text-xs">2c9e…7a33</td>
              <td className="pr-2">1</td>
              <td className="pr-2">10:00</td>
              <td className="pr-2">12:00</td>
              <td>EF Anul I</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ManualForm() {
  const { t } = useTranslation();
  const resources = useResources();
  const { setPending, setResult } = useScheduleWizardStore();
  const invalidate = useInvalidateAfterImport();
  const today = new Date();
  const [form, setForm] = useState<ManualClass>({
    resourceId: '',
    courseName: '',
    weekdays: [1],
    from: '10:00',
    to: '12:00',
    validFrom: toDateKey(today),
    validTo: toDateKey(addDays(today, 90)),
  });
  const [submitted, setSubmitted] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: ScheduleClassCreate) => client.admin.createScheduleClass(input),
    onSuccess: (res) => {
      invalidate();
      setResult(res);
    },
    onError: (e, input) => {
      // 409 cu lista rezervărilor suprapuse: se confirmă în pasul 2 (retrimitere cu `confirm_conflicts`).
      if (e instanceof ApiError && e.code === 'CONFLICTS_NEED_CONFIRMATION') {
        setPending({ kind: 'manual', input, conflicts: (e.body as ConflictsError | undefined)?.conflicts ?? [] });
      }
    },
  });

  const options = activeResources(resources.data);
  const resourceId = form.resourceId || options[0]?.id || '';
  const errors = {
    course: !form.courseName.trim() ? t('schedule.errors.course') : undefined,
    days: form.weekdays.length === 0 ? t('schedule.errors.days') : undefined,
    time: timeToMinutes(form.to) <= timeToMinutes(form.from) ? t('schedule.errors.time') : undefined,
    range: form.validTo < form.validFrom ? t('schedule.errors.range') : undefined,
  };
  const set = <K extends keyof ManualClass>(k: K, v: ManualClass[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (!SERVER_READY || Object.values(errors).some(Boolean) || !resourceId) return;
        mutation.mutate(toScheduleClass({ ...form, resourceId }));
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('schedule.columns.resource')}>
          {(c) => (
            <Select {...c} value={resourceId} onChange={(e) => set('resourceId', e.target.value)}>
              {options.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('schedule.columns.course')} error={submitted ? errors.course : undefined}>
          {(c) => <Input {...c} value={form.courseName} onChange={(e) => set('courseName', e.target.value)} maxLength={60} />}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">{t('schedule.columns.day')}</legend>
        <div className="flex flex-wrap gap-2">
          {ISO_WEEKDAYS.map((d) => (
            <Chip
              key={d}
              pressed={form.weekdays.includes(d)}
              onPressedChange={(on) => set('weekdays', toggleInList(form.weekdays, d, on).sort())}
              aria-label={t(`weekdays.long.${d}`)}
            >
              {t(`weekdays.short.${d}`)}
            </Chip>
          ))}
        </div>
        {submitted && errors.days && (
          <p role="alert" className="mt-2 text-xs font-semibold text-danger-ink">
            {errors.days}
          </p>
        )}
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('schedule.columns.from')}>{(c) => <Input {...c} type="time" value={form.from} onChange={(e) => set('from', e.target.value)} />}</Field>
        <Field label={t('schedule.columns.to')} error={submitted ? errors.time : undefined}>
          {(c) => <Input {...c} type="time" value={form.to} onChange={(e) => set('to', e.target.value)} />}
        </Field>
        <Field label={t('schedule.validFrom')}>{(c) => <Input {...c} type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}</Field>
        <Field label={t('schedule.validTo')} error={submitted ? errors.range : undefined}>
          {(c) => <Input {...c} type="date" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} />}
        </Field>
      </div>
      {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.code === 'CONFLICTS_NEED_CONFIRMATION') && (
        <p role="alert" className="text-sm font-semibold text-danger-ink">
          {errorMessage(mutation.error, t)}
        </p>
      )}
      <Button type="submit" variant="accent" size="lg" loading={mutation.isPending} disabled={!SERVER_READY}>
        {t('schedule.addClass')}
      </Button>
    </form>
  );
}

function ConflictTable({ conflicts }: { conflicts: BookingConflict[] }) {
  const { t } = useTranslation();
  const resources = useResources();
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-left">
        <caption className="sr-only">{t('schedule.conflicts.title', { count: conflicts.length })}</caption>
        <thead>
          <tr className="border-b border-line">
            {['user', 'resource', 'when'].map((c) => (
              <th key={c} scope="col" className="table-head first:pl-6">
                {t(`schedule.conflicts.col.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {conflicts.map((c) => (
            <tr key={c.booking_id} className="border-b border-line last:border-b-0">
              <td className="py-3 pl-6 pr-3 text-[15px] font-bold text-ink">{c.holder_name ?? '—'}</td>
              <td className="px-4 py-3 text-[15px] text-muted">{resourceName(resources.data, c.resource_id)}</td>
              <td className="px-4 py-3 text-[15px] text-muted">{fmtDayTime(c.start)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function CheckStep() {
  const { t } = useTranslation();
  const { pending, setResult, backToUpload } = useScheduleWizardStore();
  const invalidate = useInvalidateAfterImport();
  const commit = useMutation({
    mutationFn: () => {
      if (!pending) throw new Error('no pending import');
      return pending.kind === 'file'
        ? client.admin.confirmScheduleImport(pending.preview.import_id)
        : client.admin.createScheduleClass({ ...pending.input, confirm_conflicts: true });
    },
    onSuccess: (res) => {
      invalidate();
      setResult(res);
    },
  });
  if (!pending) return null;
  const conflicts = pending.kind === 'file' ? pending.preview.conflicts : pending.conflicts;
  const count = conflicts.length;

  return (
    <div className="space-y-5">
      {pending.kind === 'file' && (
        <Card className="grid grid-cols-2 divide-x divide-line">
          {(
            [
              ['classes', pending.preview.classes_count],
              ['occurrences', pending.preview.occurrences_count],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="px-6 py-5">
              <p className="text-sm text-muted">{t(`schedule.summary.${k}`)}</p>
              <p className="heading mt-1 text-4xl leading-none">{v}</p>
            </div>
          ))}
        </Card>
      )}

      {count > 0 ? (
        <Banner tone="warn" role="alert" title={t('schedule.conflicts.title', { count })}>
          {t('schedule.conflicts.body')}
        </Banner>
      ) : (
        <Banner tone="success" role="status" title={t('schedule.conflicts.none')} />
      )}

      {count > 0 && <ConflictTable conflicts={conflicts} />}

      {commit.isError && (
        <p role="alert" className="text-sm font-semibold text-danger-ink">
          {errorMessage(commit.error, t)}
        </p>
      )}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" onClick={backToUpload}>
          {t('common.back')}
        </Button>
        <Button
          variant="accent"
          size="lg"
          loading={commit.isPending}
          disabled={!SERVER_READY}
          leftIcon={count > 0 ? <AlertTriangle className="h-5 w-5" aria-hidden /> : undefined}
          onClick={() => commit.mutate()}
        >
          {count > 0 ? t('schedule.confirmWithConflicts', { count }) : t('schedule.confirm')}
        </Button>
      </div>
    </div>
  );
}

function DoneStep() {
  const { t } = useTranslation();
  const { result, reset } = useScheduleWizardStore();
  if (!result) return null;
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
        <CheckCircle2 className="h-9 w-9" aria-hidden />
      </div>
      <h2 className="heading mt-4 text-2xl">{t('schedule.done.title')}</h2>
      <dl className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-4">
        {(
          [
            ['occurrencesCreated', result.occurrences_created],
            ['cancelledBookings', result.cancelled_bookings_count],
            ['notifiedUsers', result.notified_users_count],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex flex-col-reverse rounded-2xl bg-subtle px-3 py-4">
            <dt className="mt-1 text-xs text-muted">{t(`schedule.done.${k}`)}</dt>
            <dd className="heading text-3xl leading-none">{v}</dd>
          </div>
        ))}
      </dl>
      <Button className="mt-6" variant="primary" size="lg" onClick={reset}>
        {t('schedule.done.again')}
      </Button>
    </Card>
  );
}
