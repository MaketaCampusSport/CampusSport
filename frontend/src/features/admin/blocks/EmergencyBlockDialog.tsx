import { AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/api/http';
import type { Channel } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { CheckboxField } from '@/components/ui/CheckboxField';
import { Field, Input, Select } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/feedback';
import { addDays, fromLocalInput, toLocalInput } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { useBlockPreview, useCreateBlock } from './queries';

const REASONS = ['burst', 'board', 'power', 'cleaning', 'weather', 'other'] as const;
type ReasonKey = (typeof REASONS)[number];

interface Props {
  resource: { id: string; name: string } | null;
  onClose: () => void;
}

/**
 * Blocare de urgență (FR-40, FR-41): din 2 acțiuni – „Blochează” pe resursă, apoi confirmarea.
 * Arată în avans câte rezervări se anulează și pe ce canale sunt anunțați utilizatorii.
 */
export function EmergencyBlockDialog({ resource, onClose }: Props) {
  const { t } = useTranslation();
  const create = useCreateBlock();
  const open = !!resource;

  const [reasonKey, setReasonKey] = useState<ReasonKey>('burst');
  const [customReason, setCustomReason] = useState('');
  const [mode, setMode] = useState<'indefinite' | 'fixed'>('indefinite');
  const [endsLocal, setEndsLocal] = useState('');
  const [channels, setChannels] = useState<Record<Channel, boolean>>({ push: true, email: true, sms: true });
  // Momentul deschiderii: previzualizarea și blocarea pornesc de la el.
  const [openedAt, setOpenedAt] = useState(() => new Date());

  useEffect(() => {
    if (open) {
      const now = new Date();
      now.setSeconds(0, 0);
      setOpenedAt(now);
      setReasonKey('burst');
      setCustomReason('');
      setMode('indefinite');
      setEndsLocal(toLocalInput(new Date(now.getTime() + 2 * 3600_000)));
      setChannels({ push: true, email: true, sms: true });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource?.id]);

  const endsAt = useMemo(() => {
    if (mode === 'indefinite') return null;
    const d = fromLocalInput(endsLocal);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [mode, endsLocal]);

  const intervalError =
    mode === 'fixed' && (!endsAt || endsAt <= openedAt) ? t('blocks.errors.endAfterStart') : undefined;
  const reasonText = reasonKey === 'other' ? customReason.trim() : t(`blocks.reasons.${reasonKey}`);
  const reasonError = reasonKey === 'other' && !reasonText ? t('blocks.errors.reasonRequired') : undefined;
  const selectedChannels = (Object.keys(channels) as Channel[]).filter((c) => channels[c]);
  const channelError = selectedChannels.length === 0 ? t('blocks.errors.channelRequired') : undefined;

  const preview = useBlockPreview(
    resource && !intervalError
      ? { resourceId: resource.id, from: openedAt.toISOString(), to: endsAt ? endsAt.toISOString() : addDays(openedAt, 30).toISOString() }
      : null,
  );

  const canSubmit = !intervalError && !reasonError && !channelError && !create.isPending;

  function submit() {
    if (!resource || !canSubmit) return;
    create.mutate(
      {
        resourceId: resource.id,
        kind: 'emergency',
        reason: reasonText,
        startsAt: openedAt.toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : null,
        recurrence: 'none',
        channels: selectedChannels,
      },
      {
        onSuccess: (block) => {
          toast.success(t('blocks.toast.blocked', { name: resource.name }), t('blocks.toast.cancelled', { count: block.affectedCount }));
          onClose();
        },
      },
    );
  }

  const count = preview.data?.affectedCount;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      tone="danger"
      icon={<AlertTriangle className="h-7 w-7" aria-hidden />}
      title={t('blocks.emergency.title', { name: resource?.name ?? '' })}
      description={t('blocks.emergency.subtitle')}
      footer={
        <>
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
            {t('common.cancelAction')}
          </Button>
          <Button variant="danger" size="lg" className="flex-1" loading={create.isPending} disabled={!canSubmit} onClick={submit}>
            {t('blocks.emergency.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label={t('blocks.fields.reason')} error={reasonError}>
          {(control) => (
            <div className="space-y-2">
              <Select {...control} value={reasonKey} onChange={(e) => setReasonKey(e.target.value as ReasonKey)}>
                {REASONS.map((k) => (
                  <option key={k} value={k}>
                    {t(`blocks.reasons.${k}`)}
                  </option>
                ))}
              </Select>
              {reasonKey === 'other' && (
                <Input
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  maxLength={80}
                  placeholder={t('blocks.fields.reasonPlaceholder')}
                  aria-label={t('blocks.fields.reason')}
                  autoFocus
                />
              )}
            </div>
          )}
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">{t('blocks.fields.interval')}</p>
          <Segmented
            aria-label={t('blocks.fields.interval')}
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'indefinite', label: t('blocks.emergency.untilFurther') },
              { value: 'fixed', label: t('blocks.emergency.fixed') },
            ]}
          />
          {mode === 'fixed' && (
            <Field label={t('blocks.fields.endsAt')} error={intervalError}>
              {(control) => (
                <Input {...control} type="datetime-local" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} />
              )}
            </Field>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">{t('blocks.emergency.channels')}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(['push', 'email', 'sms'] as Channel[]).map((c) => (
              <CheckboxField
                key={c}
                checked={channels[c]}
                onCheckedChange={(v) => setChannels((s) => ({ ...s, [c]: v }))}
                label={t(`channels.${c}`)}
              />
            ))}
          </div>
          <p className="text-xs text-muted">{t('blocks.emergency.smsNote')}</p>
          {channelError && (
            <p role="alert" className="text-xs font-semibold text-danger-ink">
              {channelError}
            </p>
          )}
        </fieldset>

        <div className="flex items-center gap-4 rounded-2xl bg-danger-soft px-5 py-4" aria-live="polite">
          {preview.isPending || count === undefined ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <span className="heading text-4xl leading-none text-danger">{count}</span>
              <div>
                <p className="text-sm font-extrabold text-danger-ink">{t('blocks.emergency.willCancel', { count })}</p>
                <p className="text-xs text-danger-ink">{t('blocks.emergency.refundNote')}</p>
              </div>
            </>
          )}
        </div>

        {create.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {create.error instanceof ApiError ? create.error.message : t('errors.generic')}
          </p>
        )}
      </div>
    </Modal>
  );
}
