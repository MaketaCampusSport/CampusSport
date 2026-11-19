import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { keys } from '@/api/keys';
import type { AnnouncementCategory, AnnouncementInput, AudienceKind, Channel } from '@/api/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CheckboxField } from '@/components/ui/CheckboxField';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { toDateKey, fmtDayTime } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { MESSAGE_MAX, TITLE_MAX, hasErrors, validateAnnouncement } from '@/lib/validators';
import { toast } from '@/stores/toastStore';
import { activeResources, useResources } from '../shared/queries';

const CATEGORY_TONE: Record<AnnouncementCategory, BadgeTone> = { urgent: 'danger', general: 'brand', maintenance: 'warn' };
const AUDIENCES: AudienceKind[] = ['all_with_bookings', 'resource', 'interval', 'waitlist'];

/** Anunțuri (FR-41/FR-43): compune, vezi câți utilizatori vor primi mesajul și trimite pe canalele alese. */
export default function AnnouncementsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const resources = useResources();
  const list = useQuery({ queryKey: keys.announcements, queryFn: () => api.announcements.list() });

  const [form, setForm] = useState<AnnouncementInput>({
    category: 'general', title: '', message: '', channels: ['push', 'email'],
    audience: 'all_with_bookings', resourceId: null, date: toDateKey(new Date()), allDay: true, from: '08:00', to: '22:00',
  });
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof AnnouncementInput>(k: K, v: AnnouncementInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const rs = activeResources(resources.data);
  // Resursa implicită, ca selectul să nu pară completat când valoarea e goală.
  const effective: AnnouncementInput = {
    ...form,
    resourceId: form.audience === 'resource' || form.audience === 'interval' ? form.resourceId ?? rs[0]?.id ?? null : null,
  };
  const errors = submitted ? validateAnnouncement(effective) : {};

  const audienceQuery = {
    audience: effective.audience, resourceId: effective.resourceId, date: effective.audience === 'interval' ? effective.date : null,
    allDay: effective.allDay, from: effective.audience === 'interval' ? effective.from : null, to: effective.audience === 'interval' ? effective.to : null,
  };
  const audience = useQuery({
    queryKey: keys.audience(audienceQuery),
    queryFn: () => api.announcements.audience(audienceQuery),
    enabled: !hasErrors(validateAnnouncement({ ...effective, title: 'x', message: 'x', channels: ['push'] })),
  });

  const send = useMutation({
    mutationFn: (i: AnnouncementInput) => api.announcements.send(i),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: keys.announcements });
      void qc.invalidateQueries({ queryKey: keys.auditAll });
      toast.success(t('announcements.toast.sent'), t('announcements.toast.recipients', { count: a.recipients }));
      setForm((f) => ({ ...f, title: '', message: '' }));
      setSubmitted(false);
    },
  });

  return (
    <>
      <PageHeader title={t('announcements.title')} subtitle={t('announcements.subtitle')} />
      <div className="grid grid-cols-[minmax(0,1fr)_440px] items-start gap-6">
        <Card className="p-6">
          <form
            noValidate
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
              if (!hasErrors(validateAnnouncement(effective))) send.mutate(effective);
            }}
          >
            <Segmented
              aria-label={t('announcements.fields.category')}
              value={form.category}
              onValueChange={(v) => set('category', v)}
              options={(['urgent', 'general', 'maintenance'] as AnnouncementCategory[]).map((c) => ({ value: c, label: t(`announcements.category.${c}`) }))}
            />
            <Field label={t('announcements.fields.title')} hint={`${form.title.length}/${TITLE_MAX}`} error={errors.title && t(`announcements.errors.${errors.title}`)}>
              {(c) => <Input {...c} value={form.title} maxLength={TITLE_MAX} onChange={(e) => set('title', e.target.value)} />}
            </Field>
            <Field label={t('announcements.fields.message')} hint={`${form.message.length}/${MESSAGE_MAX}`} error={errors.message && t(`announcements.errors.${errors.message}`)}>
              {(c) => <Textarea {...c} value={form.message} maxLength={MESSAGE_MAX} onChange={(e) => set('message', e.target.value)} />}
            </Field>

            <Field label={t('announcements.fields.audience')}>
              {(c) => (
                <Select {...c} value={form.audience} onChange={(e) => set('audience', e.target.value as AudienceKind)}>
                  {AUDIENCES.map((a) => <option key={a} value={a}>{t(`announcements.audience.${a}`)}</option>)}
                </Select>
              )}
            </Field>
            {(form.audience === 'resource' || form.audience === 'interval') && (
              <Field label={t('announcements.fields.resource')} error={errors.resource && t(`announcements.errors.${errors.resource}`)}>
                {(c) => (
                  <Select {...c} value={effective.resourceId ?? ''} onChange={(e) => set('resourceId', e.target.value)}>
                    {rs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                )}
              </Field>
            )}
            {form.audience === 'interval' && (
              <div className="grid grid-cols-3 gap-4">
                <Field label={t('announcements.fields.date')} error={errors.date && t(`announcements.errors.${errors.date}`)}>
                  {(c) => <Input {...c} type="date" value={form.date ?? ''} onChange={(e) => set('date', e.target.value)} />}
                </Field>
                <Field label={t('announcements.fields.from')} error={errors.time && t(`announcements.errors.${errors.time}`)}>
                  {(c) => <Input {...c} type="time" disabled={form.allDay} value={form.from ?? ''} onChange={(e) => set('from', e.target.value)} />}
                </Field>
                <Field label={t('announcements.fields.to')}>
                  {(c) => <Input {...c} type="time" disabled={form.allDay} value={form.to ?? ''} onChange={(e) => set('to', e.target.value)} />}
                </Field>
                <div className="col-span-3">
                  <CheckboxField checked={form.allDay} onCheckedChange={(v) => set('allDay', v)} label={t('announcements.fields.allDay')} />
                </div>
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-ink">{t('announcements.fields.channels')}</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {(['push', 'email', 'sms'] as Channel[]).map((c) => (
                  <CheckboxField
                    key={c}
                    checked={form.channels.includes(c)}
                    onCheckedChange={(v) => set('channels', v ? [...form.channels, c] : form.channels.filter((x) => x !== c))}
                    label={t(`channels.${c}`)}
                  />
                ))}
              </div>
              {errors.channels && <p role="alert" className="text-xs font-semibold text-danger-ink">{t(`announcements.errors.${errors.channels}`)}</p>}
            </fieldset>

            <div className="flex items-center justify-between gap-4 rounded-2xl bg-brand-soft px-5 py-4" aria-live="polite">
              <p className="text-sm font-bold text-brand-text">
                {audience.data ? t('announcements.reach', { count: audience.data.count }) : t('announcements.reachUnknown')}
              </p>
              <Button type="submit" variant="accent" size="lg" loading={send.isPending} leftIcon={<Send className="h-5 w-5" aria-hidden />}>
                {t('announcements.send')}
              </Button>
            </div>
            {send.isError && <p role="alert" className="text-sm font-semibold text-danger-ink">{send.error instanceof ApiError ? send.error.message : t('errors.generic')}</p>}
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="heading text-lg">{t('announcements.history')}</h2>
          {list.isError ? (
            <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
          ) : list.isPending ? (
            <Skeleton className="mt-4 h-48" />
          ) : list.data.length === 0 ? (
            <EmptyState icon={<Megaphone className="h-6 w-6" aria-hidden />} title={t('announcements.emptyTitle')} />
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {list.data.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-ink">{a.title}</p>
                    <Badge tone={CATEGORY_TONE[a.category]}>{t(`announcements.category.${a.category}`)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{a.message}</p>
                  <p className="mt-1 text-xs text-muted">
                    {fmtDayTime(a.sentAt)} · {t('announcements.recipients', { count: a.recipients })} · {formatNumber(a.deliveredPct)}%
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
