import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { keys } from '@/api/keys';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CheckboxField } from '@/components/ui/CheckboxField';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { RULE_LIMITS, hasErrors, validateRules, type NumericRuleKey } from '@/lib/validators';
import { toast } from '@/stores/toastStore';

const GROUPS: { id: string; code: string; keys: NumericRuleKey[] }[] = [
  { id: 'quota', code: 'BR-01 / BR-02', keys: ['quotaMonthly', 'maxActiveFuture'] },
  { id: 'window', code: 'BR-03', keys: ['windowStudentDays', 'windowTeacherDays', 'windowExternalHours'] },
  { id: 'cancel', code: 'BR-04 / BR-05', keys: ['cancelBeforeHours', 'checkinBeforeMin', 'checkinAfterMin'] },
  { id: 'noshow', code: 'BR-06 / BR-07', keys: ['noShowLimit', 'suspensionDays', 'waitlistOfferMinutes'] },
];

/** Reguli de business configurabile (FR-46): se aplică imediat, fără redeploy. */
export default function RulesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: keys.settings, queryFn: () => api.settings.get() });
  const [values, setValues] = useState<Record<NumericRuleKey, string> | null>(null);
  const [perSport, setPerSport] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    const { quotaPerSport, ...nums } = settings.data;
    setValues(Object.fromEntries(Object.entries(nums).map(([k, v]) => [k, String(v)])) as Record<NumericRuleKey, string>);
    setPerSport(quotaPerSport);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => {
      const nums = Object.fromEntries(Object.entries(values as Record<string, string>).map(([k, v]) => [k, Number(v)]));
      return api.settings.update({ ...(nums as Record<NumericRuleKey, number>), quotaPerSport: perSport });
    },
    onSuccess: (s) => {
      qc.setQueryData(keys.settings, s);
      void qc.invalidateQueries({ queryKey: keys.auditAll });
      toast.success(t('rules.toast.saved'));
      setSubmitted(false);
    },
  });

  if (settings.isError) return <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} />;
  if (!values) return <Skeleton className="h-[520px] rounded-3xl" />;

  const errors = validateRules(values);
  const dirty = settings.data
    ? (Object.keys(values) as NumericRuleKey[]).some((k) => String(settings.data?.[k]) !== values[k]) || perSport !== settings.data.quotaPerSport
    : false;

  return (
    <>
      <PageHeader title={t('rules.title')} subtitle={t('rules.subtitle')} />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (!hasErrors(errors)) save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-6">
          {GROUPS.map((g) => (
            <Card key={g.id} className="p-6">
              <p className="eyebrow">{g.code}</p>
              <h2 className="heading mb-4 text-lg">{t(`rules.groups.${g.id}`)}</h2>
              <div className="space-y-4">
                {g.keys.map((k) => {
                  const [min, max] = RULE_LIMITS[k];
                  return (
                    <Field
                      key={k}
                      label={t(`rules.fields.${k}`)}
                      hint={t('rules.range', { min, max })}
                      error={submitted && errors[k] ? t('rules.errors.range', { min, max }) : undefined}
                    >
                      {(c) => (
                        <div className="flex items-center gap-3">
                          <div className="w-28 shrink-0"><Input {...c} type="number" inputMode="numeric" min={min} max={max} value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} /></div>
                          <span className="text-sm text-muted">{t(`rules.units.${k}`)}</span>
                        </div>
                      )}
                    </Field>
                  );
                })}
                {g.id === 'quota' && <CheckboxField checked={perSport} onCheckedChange={setPerSport} label={t('rules.fields.quotaPerSport')} />}
              </div>
            </Card>
          ))}
        </div>
        {save.isError && <p role="alert" className="mt-4 text-sm font-semibold text-danger-ink">{save.error instanceof ApiError ? save.error.message : t('errors.generic')}</p>}
        <div className="mt-6 flex items-center gap-4">
          <Button type="submit" variant="accent" size="lg" loading={save.isPending} disabled={!dirty}>{t('common.save')}</Button>
          <Button variant="outline" size="lg" disabled={!dirty} onClick={() => { setSubmitted(false); void settings.refetch(); if (settings.data) { const { quotaPerSport, ...n } = settings.data; setValues(Object.fromEntries(Object.entries(n).map(([k, v]) => [k, String(v)])) as Record<NumericRuleKey, string>); setPerSport(quotaPerSport); } }}>{t('rules.reset')}</Button>
          <p className="text-sm text-muted">{t('rules.note')}</p>
        </div>
      </form>
    </>
  );
}
