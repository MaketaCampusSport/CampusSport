import { AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlockResult } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { fromLocalInput, toLocalInput } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { errorMessage } from '../shared/errors';
import { useCreateBlock } from './queries';

const REASONS = ['burst', 'board', 'power', 'cleaning', 'weather', 'other'] as const;
type ReasonKey = (typeof REASONS)[number];

interface Props {
  resource: { id: string; name: string } | null;
  onClose: () => void;
  onCreated?: (result: BlockResult) => void;
}

/** Toast-ul de după o blocare: câte rezervări s-au anulat și câți utilizatori sunt anunțați (`BlockResult`). */
export function useBlockResultToast() {
  const { t } = useTranslation();
  return (name: string, result: BlockResult, titleKey = 'blocks.toast.blocked') =>
    toast.success(
      t(titleKey, { name }),
      `${t('blocks.toast.cancelled', { count: result.cancelled_bookings_count })} · ${t('blocks.toast.notified', { count: result.notified_users_count })}`,
    );
}

/**
 * Blocare de urgență (FR-40, FR-41): din 2 acțiuni – „Blochează” pe resursă, apoi confirmarea.
 * Începe imediat (serverul folosește ora curentă); `end: null` = „până la noi ordine”.
 */
export function EmergencyBlockDialog({ resource, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const create = useCreateBlock();
  const showResult = useBlockResultToast();
  const open = !!resource;

  const [reasonKey, setReasonKey] = useState<ReasonKey>('burst');
  const [customReason, setCustomReason] = useState('');
  const [mode, setMode] = useState<'indefinite' | 'fixed'>('indefinite');
  const [endsLocal, setEndsLocal] = useState('');
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
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource?.id]);

  const endsAt = useMemo(() => {
    if (mode === 'indefinite') return null;
    const d = fromLocalInput(endsLocal);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [mode, endsLocal]);

  const intervalError = mode === 'fixed' && (!endsAt || endsAt <= openedAt) ? t('blocks.errors.endAfterStart') : undefined;
  const reasonText = reasonKey === 'other' ? customReason.trim() : t(`blocks.reasons.${reasonKey}`);
  const reasonError = reasonKey === 'other' && !reasonText ? t('blocks.errors.reasonRequired') : undefined;
  const canSubmit = !intervalError && !reasonError && !create.isPending;

  function submit() {
    if (!resource || !canSubmit) return;
    create.mutate(
      { resource_id: resource.id, kind: 'emergency', reason: reasonText, end: endsAt ? endsAt.toISOString() : null },
      {
        onSuccess: (result) => {
          showResult(resource.name, result);
          onCreated?.(result);
          onClose();
        },
      },
    );
  }

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
                  maxLength={200}
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
              {(control) => <Input {...control} type="datetime-local" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} />}
            </Field>
          )}
        </div>

        <div className="rounded-2xl bg-danger-soft px-5 py-4">
          <p className="text-sm font-extrabold text-danger-ink">{t('blocks.emergency.willCancel')}</p>
          <p className="text-xs text-danger-ink">{t('blocks.emergency.refundNote')}</p>
        </div>

        {create.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {errorMessage(create.error, t)}
          </p>
        )}
      </div>
    </Modal>
  );
}
