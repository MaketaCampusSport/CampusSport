import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { keys } from '@/api/keys';
import type { AccountStatus, ManagedUser, UserKind } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { fmtShortDay } from '@/lib/dates';
import { toast } from '@/stores/toastStore';

const ROLES: UserKind[] = ['student', 'teacher', 'external'];
const STATUSES: AccountStatus[] = ['active', 'suspended'];

/** Conturi de utilizatori: căutare și suspendare/reactivare (FR-05, BR-06). */
export default function UsersPage() {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [role, setRole] = useState<UserKind | ''>('');
    const [status, setStatus] = useState<AccountStatus | ''>('');
    const [target, setTarget] = useState<ManagedUser | null>(null);
    const [days, setDays] = useState('14');
    const [reason, setReason] = useState('');
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        const id = setTimeout(() => setQ(search), 300);
        return () => clearTimeout(id);
    }, [search]);

    const query = { q, role, status };
    const users = useQuery({
        queryKey: keys.users(query),
        queryFn: () => api.users.list(query),
        placeholderData: keepPreviousData,
    });

    const refresh = () =>
        Promise.all([
            qc.invalidateQueries({ queryKey: keys.usersAll }),
            qc.invalidateQueries({ queryKey: keys.auditAll }),
        ]);

    const suspend = useMutation({
        mutationFn: (v: { id: string; days: number; reason: string }) => api.users.suspend(v.id, { days: v.days, reason: v.reason }),
        onSuccess: async (u) => {
            await refresh();
            toast.success(t('users.toast.suspended', { name: u.fullName }));
            setTarget(null);
        },
    });

    const reactivate = useMutation({
        mutationFn: (id: string) => api.users.reactivate(id),
        onSuccess: async (u) => {
            await refresh();
            toast.success(t('users.toast.reactivated', { name: u.fullName }));
        },
    });

    const daysNum = Number(days);
    const daysOk = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 365;
    const reasonOk = reason.trim().length > 0;

    function openSuspend(u: ManagedUser) {
        setTarget(u);
        setDays('14');
        setReason('');
        setSubmitted(false);
        suspend.reset();
    }

    function submit() {
        setSubmitted(true);
        if (!daysOk || !reasonOk || !target) return;
        suspend.mutate({ id: target.id, days: daysNum, reason: reason.trim() });
    }

    const list = users.data ?? [];

    return (
        <>
            <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} />

            <div className="mb-4 grid grid-cols-[minmax(0,1fr)_200px_200px] gap-4">
                <Field label={t('users.search')} srOnlyLabel>
                    {(c) => <Input {...c} type="search" placeholder={t('users.search')} value={search} onChange={(e) => setSearch(e.target.value)} />}
                </Field>
                <Field label={t('users.filters.role')} srOnlyLabel>
                    {(c) => (
                        <Select {...c} value={role} onChange={(e) => setRole(e.target.value as UserKind | '')}>
                            <option value="">{t('users.filters.allRoles')}</option>
                            {ROLES.map((r) => <option key={r} value={r}>{t(`users.roles.${r}`)}</option>)}
                        </Select>
                    )}
                </Field>
                <Field label={t('users.filters.status')} srOnlyLabel>
                    {(c) => (
                        <Select {...c} value={status} onChange={(e) => setStatus(e.target.value as AccountStatus | '')}>
                            <option value="">{t('users.filters.allStatuses')}</option>
                            {STATUSES.map((s) => <option key={s} value={s}>{t(`users.status.${s}`)}</option>)}
                        </Select>
                    )}
                </Field>
            </div>

            {users.isError ? (
                <ErrorState message={users.error.message} onRetry={() => void users.refetch()} />
            ) : users.isPending ? (
                <Skeleton className="h-[420px] rounded-3xl" />
            ) : list.length === 0 ? (
                <Card>
                    <EmptyState icon={<Users className="h-6 w-6" aria-hidden />} title={t('users.emptyTitle')} description={t('users.emptyBody')} />
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="border-b border-line">
                                <th scope="col" className="table-head pl-6">{t('users.col.user')}</th>
                                <th scope="col" className="table-head">{t('users.col.role')}</th>
                                <th scope="col" className="table-head">{t('users.col.status')}</th>
                                <th scope="col" className="table-head">{t('users.col.noShows')}</th>
                                <th scope="col" className="table-head pr-6 text-right">{t('users.col.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((u) => (
                                <tr key={u.id} className="border-b border-line last:border-b-0">
                                    <td className="py-3 pl-6 pr-3">
                                        <p className="text-[15px] font-bold text-ink">{u.fullName}</p>
                                        <p className="text-sm text-muted">{u.email}</p>
                                    </td>
                                    <td className="px-4 py-3"><Badge tone={u.role === 'external' ? 'warn' : 'brand'}>{t(`users.roles.${u.role}`)}</Badge></td>
                                    <td className="px-4 py-3">
                                        <Badge tone={u.status === 'active' ? 'success' : 'danger'}>{t(`users.status.${u.status}`)}</Badge>
                                        {u.status === 'suspended' && u.suspendedUntil && (
                                            <p className="mt-1 text-xs text-muted">{t('users.until', { date: fmtShortDay(u.suspendedUntil) })}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-[15px] text-muted">{u.noShowsThisMonth}</td>
                                    <td className="py-3 pl-4 pr-6 text-right">
                                        {u.status === 'active' ? (
                                            <Button variant="outline" size="sm" onClick={() => openSuspend(u)} aria-label={`${t('users.suspend')} ${u.fullName}`}>{t('users.suspend')}</Button>
                                        ) : (
                                            <Button variant="soft" size="sm" loading={reactivate.isPending && reactivate.variables === u.id} onClick={() => reactivate.mutate(u.id)} aria-label={`${t('users.reactivate')} ${u.fullName}`}>{t('users.reactivate')}</Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}

            <Modal
                open={target !== null}
                onOpenChange={(o) => { if (!o) setTarget(null); }}
                size="sm"
                title={t('users.suspendTitle', { name: target?.fullName ?? '' })}
                description={t('users.suspendBody')}
                footer={
                    <>
                        <Button variant="outline" onClick={() => setTarget(null)}>{t('common.cancelAction')}</Button>
                        <Button type="submit" form="suspend-form" variant="danger" loading={suspend.isPending}>{t('users.suspend')}</Button>
                    </>
                }
            >
                <form id="suspend-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                    <Field label={t('users.fields.days')} error={submitted && !daysOk ? t('users.errors.days') : undefined}>
                        {(c) => <Input {...c} type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />}
                    </Field>
                    <Field label={t('users.fields.reason')} error={submitted && !reasonOk ? t('users.errors.reason') : undefined}>
                        {(c) => <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} />}
                    </Field>
                    {suspend.isError && (
                        <p role="alert" className="text-sm font-semibold text-danger-ink">
                            {suspend.error instanceof ApiError ? suspend.error.message : t('errors.generic')}
                        </p>
                    )}
                </form>
            </Modal>
        </>
    );
}
