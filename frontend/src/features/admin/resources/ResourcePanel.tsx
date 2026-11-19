import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/api/http';
import type { ExternalAccess, IsoWeekday, Resource, ResourceInput, Sport } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, toggleInList } from '@/components/ui/Chip';
import { Field, Input, Select } from '@/components/ui/fields';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { cn } from '@/lib/cn';
import {
  EQUIPMENT_IDS,
  SLOT_MINUTES,
  hasErrors,
  missingEquipment,
  validateResource,
  type ResourceFormState,
} from '@/lib/validators';
import { sportName } from '../shared/queries';

const DEFAULT_WINDOW = { days: [1, 2, 3, 4, 5] as IsoWeekday[], from: '16:00', to: '20:00' };

function toForm(r: Resource | null): ResourceFormState {
  if (!r) {
    return {
      name: '', capacity: '10', sportIds: [], equipment: [], opensAt: '08:00', closesAt: '22:00',
      slotMinutes: 60, externalAccess: 'leftover', externalWindow: DEFAULT_WINDOW,
    };
  }
  return {
    name: r.name, capacity: String(r.capacity), sportIds: r.sportIds, equipment: r.equipment,
    opensAt: r.opensAt, closesAt: r.closesAt, slotMinutes: r.slotMinutes,
    externalAccess: r.externalAccess, externalWindow: r.externalWindow ?? DEFAULT_WINDOW,
  };
}

interface Props {
  /** `null` = resursă nouă. */
  resource: Resource | null;
  sports: Sport[];
  saving: boolean;
  saveError: unknown;
  onSave: (input: ResourceInput) => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onBlock: () => void;
}

/** Panoul de editare / creare resursă (FR-39). Se remontează (key) la schimbarea resursei selectate. */
export function ResourcePanel({ resource, sports, saving, saveError, onSave, onDeactivate, onActivate, onBlock }: Props) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState<ResourceFormState>(() => toForm(resource));
  const [submitted, setSubmitted] = useState(false);

  const errors = validateResource(form);
  const shown = submitted ? errors : {};
  const missing = missingEquipment(form, sports);
  const set = <K extends keyof ResourceFormState>(key: K, value: ResourceFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors(errors) || missing.length > 0) return;
    onSave({
      name: form.name.trim(),
      capacity: Number(form.capacity),
      sportIds: form.sportIds,
      equipment: form.equipment,
      opensAt: form.opensAt,
      closesAt: form.closesAt,
      slotMinutes: form.slotMinutes,
      externalAccess: form.externalAccess,
      externalWindow: form.externalAccess === 'window' ? form.externalWindow : null,
      location: resource?.location ?? 'Complexul sportiv',
      active: resource?.active ?? true,
    } as ResourceInput);
  }

  const isNew = !resource;
  const statusBadge = resource ? (
    !resource.active ? (
      <Badge tone="neutral">{t('resources.status.inactive')}</Badge>
    ) : resource.blocked ? (
      <Badge tone="danger">{t('resources.status.blocked')}</Badge>
    ) : (
      <Badge tone="success">{t('resources.status.active')}</Badge>
    )
  ) : null;

  return (
    <Card className="sticky top-6 p-6">
      <form onSubmit={submit} noValidate aria-label={isNew ? t('resources.newTitle') : t('resources.editTitle', { name: resource.name })}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="heading text-2xl leading-tight">
            {isNew ? t('resources.newTitle') : t('resources.editTitle', { name: resource.name })}
          </h2>
          {statusBadge}
        </div>

        {resource && <ResourceThumb src={resource.photoUrl} className="mb-5 h-36 w-full rounded-2xl" />}

        <div className="space-y-5">
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label={t('resources.fields.name')} error={shown.name && t(`resources.errors.${shown.name}`)}>
              {(c) => <Input {...c} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} />}
            </Field>
            <Field label={t('resources.fields.capacity')} error={shown.capacity && t(`resources.errors.${shown.capacity}`)}>
              {(c) => (
                <Input {...c} type="number" inputMode="numeric" min={1} max={1000} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
              )}
            </Field>
          </div>

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
                {t(`resources.errors.${shown.sports}`)}
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">{t('resources.fields.equipment')}</legend>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_IDS.map((id) => (
                <Chip key={id} pressed={form.equipment.includes(id)} onPressedChange={(on) => set('equipment', toggleInList(form.equipment, id, on))}>
                  {t(`equipment.${id}`)}
                </Chip>
              ))}
            </div>
            {missing.map(({ sport, missing: m }) => (
              <p key={sport.id} role="alert" className="mt-2 text-xs font-semibold text-warn-ink">
                {t('resources.errors.needsEquipment', {
                  sport: sportName(sport, i18n.language),
                  equipment: m.map((e) => t(`equipment.${e}`)).join(', '),
                })}
              </p>
            ))}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Field className="col-span-2" label={t('resources.fields.hours')} error={shown.hours && t(`resources.errors.${shown.hours}`)}>
              {(c) => (
                <div className="flex items-center gap-2">
                  <Input {...c} type="time" value={form.opensAt} onChange={(e) => set('opensAt', e.target.value)} aria-label={t('resources.fields.opensAt')} />
                  <span aria-hidden className="text-muted">–</span>
                  <Input type="time" value={form.closesAt} onChange={(e) => set('closesAt', e.target.value)} aria-label={t('resources.fields.closesAt')} />
                </div>
              )}
            </Field>
            <Field label={t('resources.fields.slot')} error={shown.slot && t(`resources.errors.${shown.slot}`)}>
              {(c) => (
                <Select {...c} value={form.slotMinutes} onChange={(e) => set('slotMinutes', Number(e.target.value))}>
                  {SLOT_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

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
              <div className="flex flex-wrap gap-1.5">
                {([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).map((d) => {
                  const on = form.externalWindow.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={t(`weekdays.long.${d}`)}
                      onClick={() => set('externalWindow', { ...form.externalWindow, days: toggleInList(form.externalWindow.days, d, !on).sort() as IsoWeekday[] })}
                      className={cn('h-9 w-11 rounded-xl text-sm font-bold', on ? 'bg-brand text-white' : 'bg-surface text-ink hover:bg-line/60')}
                    >
                      {t(`weekdays.short.${d}`)}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Input type="time" value={form.externalWindow.from} onChange={(e) => set('externalWindow', { ...form.externalWindow, from: e.target.value })} aria-label={t('resources.fields.opensAt')} />
                <span aria-hidden className="text-muted">–</span>
                <Input type="time" value={form.externalWindow.to} onChange={(e) => set('externalWindow', { ...form.externalWindow, to: e.target.value })} aria-label={t('resources.fields.closesAt')} />
              </div>
              {shown.window && (
                <p role="alert" className="text-xs font-semibold text-danger-ink">
                  {t(`resources.errors.${shown.window}`)}
                </p>
              )}
            </fieldset>
          )}
        </div>

        {saveError ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-danger-ink">
            {saveError instanceof ApiError ? saveError.message : t('errors.generic')}
          </p>
        ) : null}

        <div className="mt-6 flex gap-3">
          {resource && resource.active && (
            <Button variant="outline" size="lg" className="flex-1" onClick={onDeactivate}>
              {t('resources.deactivate')}
            </Button>
          )}
          {resource && !resource.active && (
            <Button variant="outline" size="lg" className="flex-1" onClick={onActivate}>
              {t('resources.activate')}
            </Button>
          )}
          <Button type="submit" variant="accent" size="lg" className="flex-1" loading={saving}>
            {isNew ? t('resources.create') : t('common.save')}
          </Button>
        </div>

        {resource && resource.active && !resource.blocked && (
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
