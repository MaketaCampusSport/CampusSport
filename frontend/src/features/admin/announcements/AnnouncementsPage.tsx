import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { client, type AnnouncementCreate } from '@/api/client';
import { keys } from '@/api/keys';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CheckboxField } from '@/components/ui/CheckboxField';
import { Banner } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { fromLocalInput, toDateKey } from '@/lib/dates';
import { MESSAGE_MAX, hasErrors, validateAnnouncement, type AnnouncementForm } from '@/lib/validators';
import { toast } from '@/stores/toastStore';
import { errorMessage } from '../shared/errors';
import { activeResources, useResources } from '../shared/queries';

const EMPTY: AnnouncementForm = {
  messageRo: '',
  messageEn: '',
  resourceId: '',
  withInterval: false,
  date: toDateKey(new Date()),
  from: '08:00',
  to: '22:00',
};

/** Formular → `AnnouncementCreate`: resursa și/sau intervalul aleg destinatarii (cei cu rezervări active). */
export function toAnnouncement(f: AnnouncementForm): AnnouncementCreate {
  return {
    message_ro: f.messageRo.trim(),
    ...(f.messageEn.trim() ? { message_en: f.messageEn.trim() } : {}),
    ...(f.resourceId ? { resource_id: f.resourceId } : {}),
    ...(f.withInterval
      ? { start: fromLocalInput(`${f.date}T${f.from}`).toISOString(), end: fromLocalInput(`${f.date}T${f.to}`).toISOString() }
      : {}),
  };
}

/**
 * Anunțuri (FR-35): mesaj către utilizatorii unei resurse sau ai unui interval.
 * Contractul nu are istoric de anunțuri sau estimare a destinatarilor: numărul vine în răspuns.
 */
export default function AnnouncementsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const resources = useResources();
  const [form, setForm] = useState<AnnouncementForm>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [lastCount, setLastCount] = useState<number | null>(null);
  const set = <K extends keyof AnnouncementForm>(k: K, v: AnnouncementForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const errors = submitted ? validateAnnouncement(form) : {};
  const errorText = (k: string | undefined) => (k ? t(`announcements.errors.${k}`) : undefined);

  const send = useMutation({
    mutationFn: (input: AnnouncementCreate) => client.admin.announce(input),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: keys.auditAll });
      toast.success(t('announcements.toast.sent'), t('announcements.toast.recipients', { count: res.recipients_count }));
      setLastCount(res.recipients_count);
      setForm((f) => ({ ...f, messageRo: '', messageEn: '' }));
      setSubmitted(false);
    },
  });

  return (
    <>
      <PageHeader title={t('announcements.title')} subtitle={t('announcements.subtitle')} />
      <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6">
        <Card className="p-6">
          <form
            noValidate
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
              setLastCount(null);
              if (!hasErrors(validateAnnouncement(form))) send.mutate(toAnnouncement(form));
            }}
          >
            <Field label={t('announcements.fields.messageRo')} hint={`${form.messageRo.length}/${MESSAGE_MAX}`} error={errorText(errors.messageRo)}>
              {(c) => <Textarea {...c} value={form.messageRo} maxLength={MESSAGE_MAX} onChange={(e) => set('messageRo', e.target.value)} />}
            </Field>
            <Field label={t('announcements.fields.messageEn')} hint={t('announcements.hints.messageEn')}>
              {(c) => <Textarea {...c} value={form.messageEn} maxLength={MESSAGE_MAX} onChange={(e) => set('messageEn', e.target.value)} />}
            </Field>

            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-ink">{t('announcements.fields.audience')}</legend>
              <Field label={t('announcements.fields.resource')}>
                {(c) => (
                  <Select {...c} value={form.resourceId} onChange={(e) => set('resourceId', e.target.value)}>
                    <option value="">{t('announcements.allResources')}</option>
                    {activeResources(resources.data).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <CheckboxField checked={form.withInterval} onCheckedChange={(v) => set('withInterval', v)} label={t('announcements.fields.withInterval')} />
              {form.withInterval && (
                <div className="grid grid-cols-3 gap-4">
                  <Field label={t('announcements.fields.date')} error={errorText(errors.date)}>
                    {(c) => <Input {...c} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />}
                  </Field>
                  <Field label={t('announcements.fields.from')} error={errorText(errors.time)}>
                    {(c) => <Input {...c} type="time" value={form.from} onChange={(e) => set('from', e.target.value)} />}
                  </Field>
                  <Field label={t('announcements.fields.to')}>
                    {(c) => <Input {...c} type="time" value={form.to} onChange={(e) => set('to', e.target.value)} />}
                  </Field>
                </div>
              )}
              {errors.target && (
                <p role="alert" className="text-xs font-semibold text-danger-ink">
                  {errorText(errors.target)}
                </p>
              )}
            </fieldset>

            <div className="flex items-center justify-between gap-4 rounded-2xl bg-brand-soft px-5 py-4">
              <p className="text-sm font-bold text-brand-text">{t('announcements.reachNote')}</p>
              <Button type="submit" variant="accent" size="lg" loading={send.isPending} leftIcon={<Send className="h-5 w-5" aria-hidden />}>
                {t('announcements.send')}
              </Button>
            </div>
            {send.isError && (
              <p role="alert" className="text-sm font-semibold text-danger-ink">
                {errorMessage(send.error, t)}
              </p>
            )}
          </form>
        </Card>

        <div className="space-y-4" aria-live="polite">
          {lastCount !== null && (
            <Banner tone="success" role="status" title={t('announcements.toast.sent')}>
              {t('announcements.reach', { count: lastCount })}
            </Banner>
          )}
          <Card className="p-6">
            <h2 className="heading text-lg">{t('announcements.howTitle')}</h2>
            <p className="mt-2 text-sm text-muted">{t('announcements.howBody')}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
