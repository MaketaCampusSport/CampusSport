import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import type { IsoWeekday, ManualClassInput, SchedulePreview } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/fields';
import { Banner } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Chip, toggleInList } from '@/components/ui/Chip';
import { cn } from '@/lib/cn';
import { fmtDayTime, timeToMinutes, toDateKey, addDays } from '@/lib/dates';
import { useScheduleWizardStore } from '@/stores/scheduleWizardStore';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@/api/keys';
import { useResources } from '../shared/queries';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = '.xlsx,.xls,.csv';

/** Orar Educație Fizică (FR-42, SDD 7.4): încarcă → verifică conflictele → confirmă. */
export default function SchedulePage() {
  const { t } = useTranslation();
  const wizard = useScheduleWizardStore();
  const steps = ['upload', 'check', 'done'] as const;

  return (
    <>
      <PageHeader title={t('schedule.title')} subtitle={t('schedule.subtitle')} />
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
      {wizard.step === 2 && wizard.preview && <CheckStep preview={wizard.preview} />}
      {wizard.step === 3 && wizard.result && <DoneStep />}
    </>
  );
}

function UploadStep() {
  const { t } = useTranslation();
  const setPreview = useScheduleWizardStore((s) => s.setPreview);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<'file' | 'manual'>('file');

  const upload = useMutation({ mutationFn: (f: File) => api.schedule.previewFile(f), onSuccess: setPreview });

  function pick(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return setFileError(t('schedule.errors.type'));
    if (file.size > MAX_BYTES) return setFileError(t('schedule.errors.size'));
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
          <Chip pressed={mode === 'file'} onPressedChange={() => setMode('file')}>{t('schedule.modeFile')}</Chip>
          <Chip pressed={mode === 'manual'} onPressedChange={() => setMode('manual')}>{t('schedule.modeManual')}</Chip>
        </div>
        {mode === 'file' ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
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
              <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" aria-label={t('schedule.choose')} onChange={(e) => pick(e.target.files?.[0])} />
              <Button variant="accent" size="md" loading={upload.isPending} leftIcon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => inputRef.current?.click()}>
                {t('schedule.choose')}
              </Button>
            </div>
            {(fileError || upload.isError) && (
              <p role="alert" className="mt-3 text-sm font-semibold text-danger-ink">
                {fileError ?? (upload.error instanceof ApiError ? upload.error.message : t('errors.generic'))}
              </p>
            )}
          </>
        ) : (
          <ManualForm onPreview={setPreview} />
        )}
      </Card>

      <Card className="p-6">
        <h2 className="heading text-lg">{t('schedule.formatTitle')}</h2>
        <p className="mt-2 text-sm text-muted">{t('schedule.formatBody')}</p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              {['resource', 'course', 'day', 'from', 'to'].map((c) => (
                <th key={c} scope="col" className="py-2 pr-2 text-xs font-bold uppercase text-muted">{t(`schedule.columns.${c}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-2">Sala sport 1</td>
              <td className="pr-2">EF Anul I</td>
              <td className="pr-2">Luni</td>
              <td className="pr-2">10:00</td>
              <td>12:00</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ManualForm({ onPreview }: { onPreview: (p: SchedulePreview) => void }) {
  const { t } = useTranslation();
  const resources = useResources();
  const today = new Date();
  const [form, setForm] = useState({
    resourceId: '', courseName: '', weekdays: [1] as IsoWeekday[], from: '10:00', to: '12:00',
    validFrom: toDateKey(today), validTo: toDateKey(addDays(today, 90)),
  });
  const [submitted, setSubmitted] = useState(false);
  const mutation = useMutation({ mutationFn: (i: ManualClassInput) => api.schedule.previewManual(i), onSuccess: onPreview });

  const resourceId = form.resourceId || resources.data?.find((r) => r.active)?.id || '';
  const errors = {
    course: !form.courseName.trim() ? t('schedule.errors.course') : undefined,
    days: form.weekdays.length === 0 ? t('schedule.errors.days') : undefined,
    time: timeToMinutes(form.to) <= timeToMinutes(form.from) ? t('schedule.errors.time') : undefined,
    range: form.validTo < form.validFrom ? t('schedule.errors.range') : undefined,
  };
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (Object.values(errors).some(Boolean) || !resourceId) return;
        mutation.mutate({ ...form, resourceId, courseName: form.courseName.trim() });
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('schedule.columns.resource')}>
          {(c) => (
            <Select {...c} value={resourceId} onChange={(e) => set('resourceId', e.target.value)}>
              {(resources.data ?? []).filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
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
          {([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).map((d) => (
            <Chip key={d} pressed={form.weekdays.includes(d)} onPressedChange={(on) => set('weekdays', toggleInList(form.weekdays, d, on).sort() as IsoWeekday[])} aria-label={t(`weekdays.long.${d}`)}>
              {t(`weekdays.short.${d}`)}
            </Chip>
          ))}
        </div>
        {submitted && errors.days && <p role="alert" className="mt-2 text-xs font-semibold text-danger-ink">{errors.days}</p>}
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('schedule.columns.from')}>{(c) => <Input {...c} type="time" value={form.from} onChange={(e) => set('from', e.target.value)} />}</Field>
        <Field label={t('schedule.columns.to')} error={submitted ? errors.time : undefined}>{(c) => <Input {...c} type="time" value={form.to} onChange={(e) => set('to', e.target.value)} />}</Field>
        <Field label={t('schedule.validFrom')}>{(c) => <Input {...c} type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}</Field>
        <Field label={t('schedule.validTo')} error={submitted ? errors.range : undefined}>{(c) => <Input {...c} type="date" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} />}</Field>
      </div>
      {mutation.isError && <p role="alert" className="text-sm font-semibold text-danger-ink">{mutation.error instanceof ApiError ? mutation.error.message : t('errors.generic')}</p>}
      <Button type="submit" variant="accent" size="lg" loading={mutation.isPending}>{t('schedule.checkConflicts')}</Button>
    </form>
  );
}

function CheckStep({ preview }: { preview: SchedulePreview }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { setResult, backToUpload } = useScheduleWizardStore();
  const commit = useMutation({
    mutationFn: () => api.schedule.commit(preview.importId),
    onSuccess: (res) => {
      setResult(res);
      void qc.invalidateQueries({ queryKey: keys.blocks });
      void qc.invalidateQueries({ queryKey: keys.dashboardAll });
      void qc.invalidateQueries({ queryKey: keys.auditAll });
    },
  });
  const { conflictCount } = preview;

  return (
    <div className="space-y-5">
      <Card className="grid grid-cols-3 divide-x divide-line">
        {([['recurringClasses', preview.recurringClasses], ['weeks', preview.weeks], ['blocksGenerated', preview.blocksGenerated]] as const).map(([k, v]) => (
          <div key={k} className="px-6 py-5">
            <p className="text-sm text-muted">{t(`schedule.summary.${k}`)}</p>
            <p className="heading mt-1 text-4xl leading-none">{v}</p>
          </div>
        ))}
      </Card>

      {conflictCount > 0 ? (
        <Banner tone="warn" role="alert" title={t('schedule.conflicts.title', { count: conflictCount })}>
          {t('schedule.conflicts.body')}
        </Banner>
      ) : (
        <Banner tone="success" role="status" title={t('schedule.conflicts.none')} />
      )}

      {conflictCount > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-left">
            <caption className="sr-only">{t('schedule.conflicts.title', { count: conflictCount })}</caption>
            <thead>
              <tr className="border-b border-line">
                {['user', 'resource', 'when', 'course'].map((c) => <th key={c} scope="col" className="table-head first:pl-6">{t(`schedule.conflicts.col.${c}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.conflicts.map((c) => (
                <tr key={c.bookingId} className="border-b border-line last:border-b-0">
                  <td className="py-3 pl-6 pr-3 text-[15px] font-bold text-ink">
                    {c.userName} <Badge tone="neutral" className="ml-1">{t(`schedule.userKind.${c.userKind}`)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[15px] text-muted">{c.resourceName}</td>
                  <td className="px-4 py-3 text-[15px] text-muted">{fmtDayTime(c.startsAt)}</td>
                  <td className="px-4 py-3 text-[15px] text-muted">{c.courseName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {commit.isError && <p role="alert" className="text-sm font-semibold text-danger-ink">{commit.error instanceof ApiError ? commit.error.message : t('errors.generic')}</p>}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" onClick={backToUpload}>{t('common.back')}</Button>
        <Button variant="accent" size="lg" loading={commit.isPending} leftIcon={conflictCount > 0 ? <AlertTriangle className="h-5 w-5" aria-hidden /> : undefined} onClick={() => commit.mutate()}>
          {conflictCount > 0 ? t('schedule.confirmWithConflicts', { count: conflictCount }) : t('schedule.confirm')}
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
        {([['blocksCreated', result.blocksCreated], ['cancelledBookings', result.cancelledBookings], ['notifiedUsers', result.notifiedUsers]] as const).map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-subtle px-3 py-4">
            <dd className="heading text-3xl leading-none">{v}</dd>
            <dt className="mt-1 text-xs text-muted">{t(`schedule.done.${k}`)}</dt>
          </div>
        ))}
      </dl>
      <Button className="mt-6" variant="primary" size="lg" onClick={reset}>{t('schedule.done.again')}</Button>
    </Card>
  );
}
