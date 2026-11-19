import { CalendarClock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/api/http';
import type { Block, BlockKind, BlockRecurrence, Channel, Resource } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { CheckboxField } from '@/components/ui/CheckboxField';
import { Field, Input, Select } from '@/components/ui/fields';
import { Skeleton } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/Modal';
import { addDays, fromLocalInput, toLocalInput } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { useBlockPreview, useCreateBlock, useUpdateBlock } from './queries';

interface Props {
  open: boolean;
  /** `null` = blocare nouă. */
  block: Block | null;
  resources: Resource[];
  onClose: () => void;
}

const KINDS: BlockKind[] = ['maintenance', 'cleaning'];
const RECURRENCES: BlockRecurrence[] = ['none', 'daily', 'weekly'];

/** Blocare planificată (mentenanță / curățenie), cu recurență opțională (FR-40). */
export function PlannedBlockDialog({ open, block, resources, onClose }: Props) {
  const { t } = useTranslation();
  const create = useCreateBlock();
  const update = useUpdateBlock();
  const mutation = block ? update : create;

  const [resourceId, setResourceId] = useState('');
  const [kind, setKind] = useState<BlockKind>('maintenance');
  const [reason, setReason] = useState('');
  const [startsLocal, setStartsLocal] = useState('');
  const [endsLocal, setEndsLocal] = useState('');
  const [recurrence, setRecurrence] = useState<BlockRecurrence>('none');
  const [notify, setNotify] = useState<Record<Channel, boolean>>({ push: true, email: true, sms: false });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    create.reset();
    update.reset();
    if (block) {
      setResourceId(block.resourceId);
      setKind(block.kind === 'cleaning' ? 'cleaning' : 'maintenance');
      setReason(block.reason);
      setStartsLocal(toLocalInput(new Date(block.startsAt)));
      setEndsLocal(block.endsAt ? toLocalInput(new Date(block.endsAt)) : '');
      setRecurrence(block.recurrence);
    } else {
      const start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(8, 0, 0, 0);
      setResourceId(resources.find((r) => r.active)?.id ?? '');
      setKind('maintenance');
      setReason('');
      setStartsLocal(toLocalInput(start));
      setEndsLocal(toLocalInput(new Date(start.getTime() + 2 * 3600_000)));
      setRecurrence('none');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, block?.id]);

  const starts = fromLocalInput(startsLocal);
  const ends = fromLocalInput(endsLocal);
  const validDates = !Number.isNaN(starts.getTime()) && !Number.isNaN(ends.getTime());
  const errors = {
    resource: !resourceId ? t('blocks.errors.resourceRequired') : undefined,
    reason: !reason.trim() ? t('blocks.errors.reasonRequired') : undefined,
    interval: !validDates || ends <= starts ? t('blocks.errors.endAfterStart') : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const channels = (Object.keys(notify) as Channel[]).filter((c) => notify[c]);

  const preview = useBlockPreview(
    open && resourceId && !errors.interval
      ? {
          resourceId,
          from: starts.toISOString(),
          // O blocare recurentă afectează și apariții viitoare: previzualizăm 30 de zile.
          to: recurrence === 'none' ? ends.toISOString() : addDays(ends, 30).toISOString(),
          excludeBlockId: block?.id,
        }
      : null,
  );

  function submit() {
    setSubmitted(true);
    if (invalid) return;
    const input = {
      resourceId,
      kind,
      reason: reason.trim(),
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      recurrence,
      channels,
    };
    const done = (b: Block) => {
      toast.success(t(block ? 'blocks.toast.updated' : 'blocks.toast.planned', { name: b.resourceName }));
      onClose();
    };
    if (block) update.mutate({ id: block.id, input }, { onSuccess: done });
    else create.mutate(input, { onSuccess: done });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      tone="brand"
      icon={<CalendarClock className="h-7 w-7" aria-hidden />}
      title={block ? t('blocks.planned.editTitle') : t('blocks.planned.title')}
      description={t('blocks.planned.subtitle')}
      footer={
        <>
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
            {t('common.cancelAction')}
          </Button>
          <Button variant="accent" size="lg" className="flex-1" loading={mutation.isPending} onClick={submit}>
            {block ? t('common.save') : t('blocks.planned.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('blocks.fields.resource')} error={submitted ? errors.resource : undefined}>
            {(c) => (
              <Select {...c} value={resourceId} onChange={(e) => setResourceId(e.target.value)} disabled={!!block}>
                {resources.filter((r) => r.active || r.id === resourceId).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('blocks.fields.kind')}>
            {(c) => (
              <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as BlockKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>{t(`blocks.kinds.${k}`)}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label={t('blocks.fields.reason')} error={submitted ? errors.reason : undefined}>
          {(c) => <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={80} placeholder={t('blocks.fields.reasonPlaceholder')} />}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('blocks.fields.startsAt')}>
            {(c) => <Input {...c} type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} />}
          </Field>
          <Field label={t('blocks.fields.endsAt')} error={submitted ? errors.interval : undefined}>
            {(c) => <Input {...c} type="datetime-local" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} />}
          </Field>
        </div>

        <Field label={t('blocks.fields.recurrence')}>
          {(c) => (
            <Select {...c} value={recurrence} onChange={(e) => setRecurrence(e.target.value as BlockRecurrence)}>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>{t(`blocks.recurrence.${r}`)}</option>
              ))}
            </Select>
          )}
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">{t('blocks.planned.channels')}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(['push', 'email', 'sms'] as Channel[]).map((c) => (
              <CheckboxField key={c} checked={notify[c]} onCheckedChange={(v) => setNotify((s) => ({ ...s, [c]: v }))} label={t(`channels.${c}`)} />
            ))}
          </div>
        </fieldset>

        <div className="rounded-2xl bg-warn-soft px-5 py-4 text-sm font-semibold text-warn-ink" aria-live="polite">
          {preview.data ? t('blocks.planned.willCancel', { count: preview.data.affectedCount }) : <Skeleton className="h-5 w-48" />}
        </div>

        {mutation.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {mutation.error instanceof ApiError ? mutation.error.message : t('errors.generic')}
          </p>
        )}
      </div>
    </Modal>
  );
}
