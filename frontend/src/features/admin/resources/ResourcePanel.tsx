import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Block, ExternalAccess, Resource, ResourceInput, Sport } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, toggleInList } from '@/components/ui/Chip';
import { Field, Input, Select } from '@/components/ui/fields';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { cn } from '@/lib/cn';
import {
  ISO_WEEKDAYS,
  SLOT_MINUTES,
  hasErrors,
  missingEquipment,
  validateResource,
  type IsoWeekday,
  type ResourceFormState,
  type WeeklyWindow,
} from '@/lib/validators';
import { errorMessage } from '../shared/errors';
import { equipmentOptions, sportName } from '../shared/queries';
import { hasMixedHours, toForm, toResourceInput } from './resourceForm';

interface Props {
  /** `null` = resursă nouă. */
  resource: Resource | null;
  /** Blocarea activă acum (urgență / mentenanță), dacă există. */
  blocked?: Block;
  sports: Sport[];
  defaultSlot?: number;
  saving: boolean;
  saveError: unknown;
  onSave: (input: ResourceInput) => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onBlock: () => void;
}

function DayPicker({ value, onChange, label }: { value: IsoWeekday[]; onChange: (days: IsoWeekday[]) => void; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {ISO_WEEKDAYS.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={t(`weekdays.long.${d}`)}
            onClick={() => onChange((toggleInList(value, d, !on) as IsoWeekday[]).sort())}
            className={cn('h-9 w-11 rounded-xl text-sm font-bold', on ? 'bg-brand text-white' : 'bg-subtle text-ink hover:bg-line/60')}
          >
            {t(`weekdays.short.${d}`)}
          </button>
        );
      })}
    </div>
  );
}

function TimeRangeInputs({ value, onChange }: { value: WeeklyWindow; onChange: (w: WeeklyWindow) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <Input type="time" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label={t('resources.fields.opensAt')} />
      <span aria-hidden className="text-muted">–</span>
      <Input type="time" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label={t('resources.fields.closesAt')} />
    </div>
  );
}

/** Panoul de editare / creare resursă (FR-39). Se remontează (key) la schimbarea resursei selectate. */
export function ResourcePanel({ resource, blocked, sports, defaultSlot, saving, saveError, onSave, onDeactivate, onActivate, onBlock }: Props) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState<ResourceFormState>(() => toForm(resource, defaultSlot));
  const [submitted, setSubmitted] = useState(false);

  const errors = validateResource(form);
  const shown = submitted ? errors : {};
  const missing = missingEquipment(form, sports);
  const set = <K extends keyof ResourceFormState>(key: K, value: ResourceFormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const equipment = equipmentOptions(sports, form.equipment);
  const errorText = (key: string | undefined) => (key ? t(`resources.errors.${key}`) : undefined);

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors(errors) || missing.length > 0) return;
    onSave(toResourceInput(form, resource?.active ?? true));
  }

  const isNew = !resource;
  const active = resource?.active !== false;
  const statusBadge = resource ? (
    !active ? (
      <Badge tone="neutral">{t('resources.status.inactive')}</Badge>
    ) : blocked ? (
      <Badge tone="danger">{t('resources.status.blocked')}</Badge>
    ) : (
      <Badge tone="success">{t('resources.status.active')}</Badge>
    )
  ) : null;
  const title = isNew ? t('resources.newTitle') : t('resources.editTitle', { name: resource.name ?? '' });

  return (
    <Card className="sticky top-6 p-6">
      <form onSubmit={submit} noValidate aria-label={title}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="heading text-2xl leading-tight">{title}</h2>
          {statusBadge}
        </div>

        {resource?.photo_url && <ResourceThumb src={resource.photo_url} className="mb-5 h-36 w-full rounded-2xl" />}

        <div className="space-y-5">
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label={t('resources.fields.name')} error={errorText(shown.name)}>
              {(c) => <Input {...c} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />}
            </Field>
            <Field label={t('resources.fields.capacity')} error={errorText(shown.capacity)}>
              {(c) => <Input {...c} type="number" inputMode="numeric" min={1} max={1000} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('resources.fields.type')} hint={t('resources.hints.type')} error={errorText(shown.type)}>
              {(c) => <Input {...c} value={form.type} onChange={(e) => set('type', e.target.value)} maxLength={60} />}
            </Field>
            <Field label={t('resources.fields.location')} error={errorText(shown.location)}>
              {(c) => <Input {...c} value={form.location} onChange={(e) => set('location', e.target.value)} maxLength={250} />}
            </Field>
          </div>

          <Field label={t('resources.fields.photo')} hint={t('resources.hints.photo')} error={errorText(shown.photo)}>
            {(c) => <Input {...c} type="url" inputMode="url" value={form.photoUrl} onChange={(e) => set('photoUrl', e.target.value)} placeholder="https://" />}
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">{t('resources.fields.sports')}</legend>
            <div className="flex flex-wrap gap-2">
              {sports.map((s) => (
                <Chip key={s.id} pressed={form.sportIds.includes(s.id)} onPressedChange={(on) => set('sportIds', toggleInList(form.sportIds, s.id, on))}>
                  {sportName(s, i18n.language)}
                </Chip>
              ))}
            </div>
            {shown.sports && (
              <p role="alert" className="mt-2 text-xs font-semibold text-danger-ink">
                {errorText(shown.sports)}
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">{t('resources.fields.equipment')}</legend>
            <div className="flex flex-wrap gap-2">
              {equipment.map((id) => (
                <Chip key={id} pressed={form.equipment.includes(id)} onPressedChange={(on) => set('equipment', toggleInList(form.equipment, id, on))}>
                  {t(`equipment.${id}`, { defaultValue: id })}
                </Chip>
              ))}
            </div>
            {missing.map(({ sport, missing: m }) => (
              <p key={sport.id} role="alert" className="mt-2 text-xs font-semibold text-warn-ink">
                {t('resources.errors.needsEquipment', {
                  sport: sportName(sport, i18n.language),
                  equipment: m.map((e) => t(`equipment.${e}`, { defaultValue: e })).join(', '),
                })}
              </p>
            ))}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-ink">{t('resources.fields.hours')}</legend>
            <DayPicker value={form.hours.days} onChange={(days) => set('hours', { ...form.hours, days })} label={t('resources.fields.openDays')} />
            <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-3">
              <TimeRangeInputs value={form.hours} onChange={(hours) => set('hours', hours)} />
              <Select aria-label={t('resources.fields.slot')} value={form.slotMinutes} onChange={(e) => set('slotMinutes', Number(e.target.value))}>
                {[...new Set([...SLOT_MINUTES, form.slotMinutes])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </div>
            {(shown.hours || shown.slot) && (
              <p role="alert" className="text-xs font-semibold text-danger-ink">
                {errorText(shown.hours ?? shown.slot)}
              </p>
            )}
            {resource && hasMixedHours(resource.opening_hours) && <p className="text-xs text-warn-ink">{t('resources.hints.mixedHours')}</p>}
          </fieldset>

          <Field label={t('resources.fields.external')}>
            {(c) => (
              <Select {...c} value={form.externalAccess} onChange={(e) => set('externalAccess', e.target.value as ExternalAccess)}>
                <option value="never">{t('resources.external.never')}</option>
                <option value="window">{t('resources.external.window')}</option>
                <option value="leftover">{t('resources.external.leftover')}</option>
              </Select>
            )}
          </Field>

          {form.externalAccess === 'window' && (
            <fieldset className="space-y-3 rounded-2xl bg-subtle p-4">
              <legend className="sr-only">{t('resources.external.window')}</legend>
              <DayPicker value={form.externalWindow.days} onChange={(days) => set('externalWindow', { ...form.externalWindow, days })} label={t('resources.external.window')} />
              <TimeRangeInputs value={form.externalWindow} onChange={(w) => set('externalWindow', w)} />
              {shown.window && (
                <p role="alert" className="text-xs font-semibold text-danger-ink">
                  {errorText(shown.window)}
                </p>
              )}
            </fieldset>
          )}
        </div>

        {saveError ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-danger-ink">
            {errorMessage(saveError, t)}
          </p>
        ) : null}

        <div className="mt-6 flex gap-3">
          {resource && active && (
            <Button variant="outline" size="lg" className="flex-1" onClick={onDeactivate}>
              {t('resources.deactivate')}
            </Button>
          )}
          {resource && !active && (
            <Button variant="outline" size="lg" className="flex-1" onClick={onActivate}>
              {t('resources.activate')}
            </Button>
          )}
          <Button type="submit" variant="accent" size="lg" className="flex-1" loading={saving}>
            {isNew ? t('resources.create') : t('common.save')}
          </Button>
        </div>

        {resource && active && !blocked && (
          <button
            type="button"
            onClick={onBlock}
            className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-danger-ink hover:underline"
          >
            <Lock className="h-4 w-4" aria-hidden />
            {t('resources.blockNow')}
          </button>
        )}
      </form>
    </Card>
  );
}
