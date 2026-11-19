import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { keys } from '@/api/keys';
import type { Sport, SportInput } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CheckboxField } from '@/components/ui/CheckboxField';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { EQUIPMENT_IDS } from '@/lib/validators';
import { toast } from '@/stores/toastStore';
import { sportName, useSports } from '../shared/queries';

interface FormState {
  nameRo: string;
  nameEn: string;
  equipment: string[];
}

const EMPTY: FormState = { nameRo: '', nameEn: '', equipment: [] };

/** Sporturi și dotări necesare (NFR-14, FR-07): se administrează din panou, fără modificări de cod. */
export default function SportsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const sports = useSports();
  const [editing, setEditing] = useState<Sport | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [toDelete, setToDelete] = useState<Sport | null>(null);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.sports }),
      qc.invalidateQueries({ queryKey: keys.resources }),
      qc.invalidateQueries({ queryKey: keys.auditAll }),
    ]);

  function closeForm() {
    setEditing(null);
    setSubmitted(false);
  }

  const save = useMutation({
    mutationFn: (input: SportInput) =>
      editing && editing !== 'new' ? api.sports.update(editing.id, input) : api.sports.create(input),
    onSuccess: async (s) => {
      await refresh();
      toast.success(t('sports.toast.saved', { name: s.nameRo }));
      closeForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.sports.remove(id),
    onSuccess: async () => {
      await refresh();
      toast.success(t('sports.toast.deleted'));
      setToDelete(null);
    },
  });

  function openForm(s: Sport | 'new') {
    setForm(s === 'new' ? EMPTY : { nameRo: s.nameRo, nameEn: s.nameEn, equipment: s.requiredEquipment });
    setSubmitted(false);
    save.reset();
    setEditing(s);
  }

  function toggleEquipment(id: string, on: boolean) {
    setForm((f) => ({ ...f, equipment: on ? [...f.equipment, id] : f.equipment.filter((x) => x !== id) }));
  }

  const errors = {
    nameRo: !form.nameRo.trim(),
    nameEn: !form.nameEn.trim(),
  };

  function submit() {
    setSubmitted(true);
    if (errors.nameRo || errors.nameEn) return;
    save.mutate({ nameRo: form.nameRo.trim(), nameEn: form.nameEn.trim(), requiredEquipment: form.equipment });
  }

  const list = sports.data ?? [];

  return (
    <>
      <PageHeader
        title={t('sports.title')}
        subtitle={t('sports.subtitle')}
        actions={<Button variant="accent" onClick={() => openForm('new')}>{t('sports.new')}</Button>}
      />

      {sports.isError ? (
        <ErrorState message={sports.error.message} onRetry={() => void sports.refetch()} />
      ) : sports.isPending ? (
        <Skeleton className="h-[360px] rounded-3xl" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Trophy className="h-6 w-6" aria-hidden />} title={t('sports.emptyTitle')} description={t('sports.emptyBody')} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="table-head pl-6">{t('sports.col.nameRo')}</th>
                <th scope="col" className="table-head">{t('sports.col.nameEn')}</th>
                <th scope="col" className="table-head">{t('sports.col.equipment')}</th>
                <th scope="col" className="table-head pr-6 text-right">{t('sports.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-b-0">
                  <td className="py-3 pl-6 pr-3 text-[15px] font-bold text-ink">{s.nameRo}</td>
                  <td className="px-4 py-3 text-[15px] text-muted">{s.nameEn}</td>
                  <td className="px-4 py-3">
                    {s.requiredEquipment.length === 0 ? (
                      <span className="text-sm text-muted">{t('sports.noEquipment')}</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {s.requiredEquipment.map((e) => (
                          <Badge key={e} tone="neutral">{t(`equipment.${e}`, { defaultValue: e })}</Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pl-4 pr-6">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" leftIcon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => openForm(s)} aria-label={`${t('common.edit')} ${sportName(s, i18n.language)}`}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="outline" size="sm" leftIcon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => { remove.reset(); setToDelete(s); }} aria-label={`${t('sports.delete')} ${sportName(s, i18n.language)}`}>
                        {t('sports.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={editing !== null}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        title={editing === 'new' ? t('sports.newTitle') : t('sports.editTitle')}
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>{t('common.cancelAction')}</Button>
            <Button type="submit" form="sport-form" variant="accent" loading={save.isPending}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="sport-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label={t('sports.fields.nameRo')} error={submitted && errors.nameRo ? t('sports.errors.required') : undefined}>
            {(c) => <Input {...c} value={form.nameRo} onChange={(e) => setForm({ ...form, nameRo: e.target.value })} />}
          </Field>
          <Field label={t('sports.fields.nameEn')} error={submitted && errors.nameEn ? t('sports.errors.required') : undefined}>
            {(c) => <Input {...c} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />}
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-ink">{t('sports.fields.equipment')}</legend>
            <p className="mb-2 text-sm text-muted">{t('sports.hint.equipment')}</p>
            <div className="grid grid-cols-2 gap-2">
              {EQUIPMENT_IDS.map((id) => (
                <CheckboxField
                  key={id}
                  checked={form.equipment.includes(id)}
                  onCheckedChange={(on) => toggleEquipment(id, on)}
                  label={t(`equipment.${id}`)}
                />
              ))}
            </div>
          </fieldset>
          {save.isError && (
            <p role="alert" className="text-sm font-semibold text-danger-ink">
              {save.error instanceof ApiError ? save.error.message : t('errors.generic')}
            </p>
          )}
        </form>
      </Modal>

      <Modal
        open={toDelete !== null}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        size="sm"
        title={t('sports.deleteTitle', { name: toDelete ? sportName(toDelete, i18n.language) : '' })}
        description={t('sports.deleteBody')}
        footer={
          <>
            <Button variant="outline" onClick={() => setToDelete(null)}>{t('common.cancelAction')}</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.id)}>{t('sports.delete')}</Button>
          </>
        }
      >
        {remove.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {remove.error instanceof ApiError ? remove.error.message : t('errors.generic')}
          </p>
        )}
      </Modal>
    </>
  );
}
