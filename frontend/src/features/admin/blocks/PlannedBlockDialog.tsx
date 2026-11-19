import { CalendarClock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlockResult, Resource } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { fromLocalInput, toLocalInput } from '@/lib/dates';
import { errorMessage } from '../shared/errors';
import { activeResources } from '../shared/queries';
import { useBlockResultToast } from './EmergencyBlockDialog';
import { useCreateBlock } from './queries';

interface Props {
  open: boolean;
  resources: Resource[];
  onClose: () => void;
  onCreated?: (result: BlockResult) => void;
}

/**
 * Blocare planificată pentru mentenanță (FR-40), pe un interval fix.
 * Contractul nu are previzualizare sau editare: rezultatul (anulări, utilizatori anunțați) se arată după creare.
 */
export function PlannedBlockDialog({ open, resources, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const create = useCreateBlock();
  const showResult = useBlockResultToast();
  const options = activeResources(resources);

  const [resourceId, setResourceId] = useState('');
  const [reason, setReason] = useState('');
  const [startsLocal, setStartsLocal] = useState('');
  const [endsLocal, setEndsLocal] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    create.reset();
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(8, 0, 0, 0);
    setResourceId(options[0]?.id ?? '');
    setReason('');
    setStartsLocal(toLocalInput(start));
    setEndsLocal(toLocalInput(new Date(start.getTime() + 2 * 3600_000)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const starts = fromLocalInput(startsLocal);
  const ends = fromLocalInput(endsLocal);
  const validDates = !Number.isNaN(starts.getTime()) && !Number.isNaN(ends.getTime());
  const errors = {
    resource: !resourceId ? t('blocks.errors.resourceRequired') : undefined,
    reason: !reason.trim() ? t('blocks.errors.reasonRequired') : undefined,
    interval: !validDates || ends <= starts ? t('blocks.errors.endAfterStart') : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  function submit() {
    setSubmitted(true);
    if (invalid) return;
    create.mutate(
      { resource_id: resourceId, kind: 'maintenance', reason: reason.trim(), start: starts.toISOString(), end: ends.toISOString() },
      {
        onSuccess: (result) => {
          showResult(options.find((r) => r.id === resourceId)?.name ?? '', result, 'blocks.toast.planned');
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
      tone="brand"
      icon={<CalendarClock className="h-7 w-7" aria-hidden />}
      title={t('blocks.planned.title')}
      description={t('blocks.planned.subtitle')}
      footer={
        <>
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
            {t('common.cancelAction')}
          </Button>
          <Button variant="accent" size="lg" className="flex-1" loading={create.isPending} onClick={submit}>
            {t('blocks.planned.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label={t('blocks.fields.resource')} error={submitted ? errors.resource : undefined}>
          {(c) => (
            <Select {...c} value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              {options.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('blocks.fields.reason')} error={submitted ? errors.reason : undefined}>
          {(c) => <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={t('blocks.fields.reasonPlaceholder')} />}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('blocks.fields.startsAt')}>
            {(c) => <Input {...c} type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} />}
          </Field>
          <Field label={t('blocks.fields.endsAt')} error={submitted ? errors.interval : undefined}>
            {(c) => <Input {...c} type="datetime-local" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} />}
          </Field>
        </div>

        <p className="rounded-2xl bg-warn-soft px-5 py-4 text-sm font-semibold text-warn-ink">{t('blocks.planned.willCancel')}</p>

        {create.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {errorMessage(create.error, t)}
          </p>
        )}
      </div>
    </Modal>
  );
}
