import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { client, type Settings, type SettingsWritable } from '@/api/client';
import { keys } from '@/api/keys';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CheckboxField } from '@/components/ui/CheckboxField';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { fmtDayTime } from '@/lib/dates';
import { NUMERIC_RULE_KEYS, RULE_LIMITS, hasErrors, invalidSportQuotas, validateRules, type NumericRuleKey } from '@/lib/validators';
import { toast } from '@/stores/toastStore';
import { errorMessage } from '../shared/errors';
import { sportName, useSports } from '../shared/queries';

const GROUPS: { id: string; code: string; keys: NumericRuleKey[] }[] = [
  { id: 'quota', code: 'BR-01 / BR-02', keys: ['monthly_quota', 'max_active_bookings'] },
  { id: 'window', code: 'BR-03', keys: ['booking_window_days_student', 'booking_window_days_teacher', 'booking_window_hours_external'] },
  { id: 'cancel', code: 'BR-04 / BR-05', keys: ['cancel_free_hours', 'checkin_minutes_before', 'checkin_minutes_after'] },
  { id: 'noshow', code: 'BR-06 / BR-07', keys: ['no_show_threshold', 'no_show_suspension_days', 'waitlist_offer_minutes', 'waitlist_simultaneous_under_hours'] },
  { id: 'slots', code: 'BR-08 / FR-24', keys: ['default_slot_minutes'] },
];

/** Starea formularului: numerele ca text, ca validarea să poată semnala valorile goale sau zecimale. */
interface RulesForm {
  values: Record<NumericRuleKey, string>;
  perSport: boolean;
  sportQuotas: Record<string, string>;
  memberReplacesExternal: boolean;
}

function toRulesForm(s: Settings): RulesForm {
  const perSport = s.monthly_quota_per_sport ?? {};
  return {
    values: Object.fromEntries(NUMERIC_RULE_KEYS.map((k) => [k, String(s[k])])) as Record<NumericRuleKey, string>,
    perSport: Object.keys(perSport).length > 0,
    sportQuotas: Object.fromEntries(Object.entries(perSport).map(([k, v]) => [k, String(v)])),
    memberReplacesExternal: s.member_replaces_external,
  };
}

function toSettings(f: RulesForm): SettingsWritable {
  const nums = Object.fromEntries(NUMERIC_RULE_KEYS.map((k) => [k, Number(f.values[k])])) as Record<NumericRuleKey, number>;
  return {
    ...nums,
    monthly_quota_per_sport: f.perSport ? Object.fromEntries(Object.entries(f.sportQuotas).map(([k, v]) => [k, Number(v)])) : {},
    member_replaces_external: f.memberReplacesExternal,
  };
}

/** Reguli de business configurabile (FR-46, SRS 9.2): se aplică imediat, fără redeploy. */
export default function RulesPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: keys.settings, queryFn: () => client.admin.settings() });
  const sports = useSports();
  const [form, setForm] = useState<RulesForm | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(toRulesForm(settings.data));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (input: SettingsWritable) => client.admin.updateSettings(input),
    onSuccess: (s) => {
      qc.setQueryData(keys.settings, s);
      void qc.invalidateQueries({ queryKey: keys.auditAll });
      toast.success(t('rules.toast.saved'));
      setSubmitted(false);
    },
  });

  if (settings.isError) return <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} />;
  if (!form || !settings.data) return <Skeleton className="h-[520px] rounded-3xl" />;

  const errors = validateRules(form.values);
  const badSports = form.perSport ? invalidSportQuotas(form.sportQuotas) : [];
  const dirty = JSON.stringify(toSettings(form)) !== JSON.stringify(toSettings(toRulesForm(settings.data)));
  const setValue = (k: NumericRuleKey, v: string) => setForm({ ...form, values: { ...form.values, [k]: v } });

  function togglePerSport(on: boolean) {
    if (!form) return;
    const quotas = on
      ? Object.fromEntries((sports.data ?? []).map((s) => [s.id, form.sportQuotas[s.id] ?? form.values.monthly_quota]))
      : form.sportQuotas;
    setForm({ ...form, perSport: on, sportQuotas: quotas });
  }

  const [qMin, qMax] = RULE_LIMITS.monthly_quota;

  return (
    <>
      <PageHeader
        title={t('rules.title')}
        subtitle={
          settings.data.updated_at
            ? `${t('rules.subtitle')} ${t('rules.updatedAt', { at: fmtDayTime(settings.data.updated_at) })}`
            : t('rules.subtitle')
        }
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (!hasErrors(errors) && badSports.length === 0) save.mutate(toSettings(form));
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
                          <div className="w-28 shrink-0">
                            <Input {...c} type="number" inputMode="numeric" min={min} max={max} value={form.values[k]} onChange={(e) => setValue(k, e.target.value)} />
                          </div>
                          <span className="text-sm text-muted">{t(`rules.units.${k}`)}</span>
                        </div>
                      )}
                    </Field>
                  );
                })}

                {g.id === 'quota' && (
                  <>
                    <CheckboxField checked={form.perSport} onCheckedChange={togglePerSport} label={t('rules.fields.monthly_quota_per_sport')} />
                    {form.perSport && (
                      <div className="space-y-3 rounded-2xl bg-subtle p-4">
                        {(sports.data ?? []).map((s) => (
                          <Field
                            key={s.id}
                            label={sportName(s, i18n.language)}
                            error={submitted && badSports.includes(s.id) ? t('rules.errors.range', { min: qMin, max: qMax }) : undefined}
                          >
                            {(c) => (
                              <div className="flex items-center gap-3">
                                <div className="w-28 shrink-0">
                                  <Input
                                    {...c}
                                    type="number"
                                    inputMode="numeric"
                                    min={qMin}
                                    max={qMax}
                                    value={form.sportQuotas[s.id] ?? ''}
                                    onChange={(e) => setForm({ ...form, sportQuotas: { ...form.sportQuotas, [s.id]: e.target.value } })}
                                  />
                                </div>
                                <span className="text-sm text-muted">{t('rules.units.monthly_quota')}</span>
                              </div>
                            )}
                          </Field>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {g.id === 'slots' && (
                  <CheckboxField
                    checked={form.memberReplacesExternal}
                    onCheckedChange={(v) => setForm({ ...form, memberReplacesExternal: v })}
                    label={t('rules.fields.member_replaces_external')}
                  />
                )}
              </div>
            </Card>
          ))}
        </div>
        {save.isError && (
          <p role="alert" className="mt-4 text-sm font-semibold text-danger-ink">
            {errorMessage(save.error, t)}
          </p>
        )}
        <div className="mt-6 flex items-center gap-4">
          <Button type="submit" variant="accent" size="lg" loading={save.isPending} disabled={!dirty}>
            {t('common.save')}
          </Button>
          <Button
            variant="outline"
            size="lg"
            disabled={!dirty}
            onClick={() => {
              setSubmitted(false);
              if (settings.data) setForm(toRulesForm(settings.data));
            }}
          >
            {t('rules.reset')}
          </Button>
          <p className="text-sm text-muted">{t('rules.note')}</p>
        </div>
      </form>
    </>
  );
}
