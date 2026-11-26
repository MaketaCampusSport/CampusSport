import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { client, type AccountStatus, type ListUsersData, type Role, type User } from '@/api/client';
import { keys } from '@/api/keys';
import { useSession } from '@/auth/sessionStore';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { fmtShortDay } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { errorMessage } from '../shared/errors';
import { Pagination } from '../shared/Pagination';
import { UserFormModal } from './UserFormModal';

const ROLES: Role[] = ['student', 'teacher', 'external', 'admin'];
const STATUSES: AccountStatus[] = ['active', 'suspended'];
const ROLE_TONE: Record<Role, BadgeTone> = { student: 'brand', teacher: 'brand', external: 'warn', admin: 'neutral' };
const PAGE_SIZE = 20;

/** `until` pentru POST /admin/users/{id}/suspend: acum + N zile. */
export function suspensionUntil(days: number, now = new Date()): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

/** Conturi de utilizatori: căutare, creare, editare (cu fotografie), ștergere și suspendare/reactivare (FR-05, BR-06). */
export default function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<AccountStatus | ''>('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<User | null>(null);
  const [days, setDays] = useState('14');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  /** `undefined` = închis, `null` = cont nou, altfel contul editat. */
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<User | null>(null);
  const me = useSession((s) => s.user);
  const setSessionUser = useSession((s) => s.setUser);

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const query: ListUsersData['query'] = {
    ...(q ? { q } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    page,
    page_size: PAGE_SIZE,
  };
  const users = useQuery({ queryKey: keys.users(query), queryFn: () => client.admin.users(query), placeholderData: keepPreviousData });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: keys.usersAll }), qc.invalidateQueries({ queryKey: keys.auditAll })]);

  const suspend = useMutation({
    mutationFn: (v: { id: string; until: string; reason: string }) => client.admin.suspendUser(v.id, { until: v.until, reason: v.reason }),
    onSuccess: async (u) => {
      await refresh();
      toast.success(t('users.toast.suspended', { name: u.full_name }));
      setTarget(null);
    },
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => client.admin.reactivateUser(id),
    onSuccess: async (u) => {
      await refresh();
      toast.success(t('users.toast.reactivated', { name: u.full_name }));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const remove = useMutation({
    mutationFn: (u: User) => client.admin.deleteUser(u.id),
    onSuccess: async (_, u) => {
      await refresh();
      toast.success(t('users.toast.deleted', { name: u.full_name }));
      setDeleting(null);
    },
  });

  async function saved(u: User, kind: 'created' | 'updated' | 'photo') {
    setSessionUser(u); // propriul cont: meniul arată imediat numele și fotografia noi
    await refresh();
    if (kind === 'photo') return;
    toast.success(t(kind === 'created' ? 'users.toast.created' : 'users.toast.updated', { name: u.full_name }));
    setEditing(undefined);
  }

  const daysNum = Number(days);
  const daysOk = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 365;
  const reasonOk = reason.trim().length > 0;

  function openSuspend(u: User) {
    setTarget(u);
    setDays('14');
    setReason('');
    setSubmitted(false);
    suspend.reset();
  }

  function submit() {
    setSubmitted(true);
    if (!daysOk || !reasonOk || !target) return;
    suspend.mutate({ id: target.id, until: suspensionUntil(daysNum), reason: reason.trim() });
  }

  const d = users.data;

  return (
    <>
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={
          <Button variant="primary" leftIcon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setEditing(null)}>
            {t('users.add')}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_200px_200px] gap-4">
        <Field label={t('users.search')} srOnlyLabel>
          {(c) => <Input {...c} type="search" placeholder={t('users.search')} value={search} onChange={(e) => setSearch(e.target.value)} />}
        </Field>
        <Field label={t('users.filters.role')} srOnlyLabel>
          {(c) => (
            <Select
              {...c}
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role | '');
                setPage(1);
              }}
            >
              <option value="">{t('users.filters.allRoles')}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`users.roles.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('users.filters.status')} srOnlyLabel>
          {(c) => (
            <Select
              {...c}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as AccountStatus | '');
                setPage(1);
              }}
            >
              <option value="">{t('users.filters.allStatuses')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`users.status.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {users.isError ? (
        <ErrorState message={users.error.message} onRetry={() => void users.refetch()} />
      ) : !d ? (
        <Skeleton className="h-[420px] rounded-3xl" />
      ) : d.items.length === 0 ? (
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
                <th scope="col" className="table-head">{t('users.col.phone')}</th>
                <th scope="col" className="table-head pr-6 text-right">{t('users.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-b-0">
                  <td className="py-3 pl-6 pr-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name} src={u.avatar_url} tone="soft" size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold text-ink">{u.full_name}</p>
                        <p className="truncate text-sm text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ROLE_TONE[u.role]}>{t(`users.roles.${u.role}`)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={u.status === 'active' ? 'success' : 'danger'}>{t(`users.status.${u.status}`)}</Badge>
                    {u.status === 'suspended' && u.suspended_until && (
                      <p className="mt-1 text-xs text-muted">{t('users.until', { date: fmtShortDay(u.suspended_until) })}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[15px] text-muted">{u.phone ?? '—'}</td>
                  <td className="py-3 pl-4 pr-6">
                    <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(u)}
                      leftIcon={<Pencil className="h-4 w-4" aria-hidden />}
                      aria-label={`${t('common.edit')} ${u.full_name}`}
                    >
                      {t('common.edit')}
                    </Button>
                    {u.role === 'admin' ? null : u.status === 'active' ? (
                      <Button variant="outline" size="sm" onClick={() => openSuspend(u)} aria-label={`${t('users.suspend')} ${u.full_name}`}>
                        {t('users.suspend')}
                      </Button>
                    ) : (
                      <Button
                        variant="soft"
                        size="sm"
                        loading={reactivate.isPending && reactivate.variables === u.id}
                        onClick={() => reactivate.mutate(u.id)}
                        aria-label={`${t('users.reactivate')} ${u.full_name}`}
                      >
                        {t('users.reactivate')}
                      </Button>
                    )}
                    {u.id !== me?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          remove.reset();
                          setDeleting(u);
                        }}
                        aria-label={`${t('users.delete')} ${u.full_name}`}
                        className="text-danger-ink hover:bg-danger-soft"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination meta={d} onPage={setPage} />
        </Card>
      )}

      <Modal
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        size="sm"
        title={t('users.suspendTitle', { name: target?.full_name ?? '' })}
        description={t('users.suspendBody')}
        footer={
          <>
            <Button variant="outline" onClick={() => setTarget(null)}>
              {t('common.cancelAction')}
            </Button>
            <Button type="submit" form="suspend-form" variant="danger" loading={suspend.isPending}>
              {t('users.suspend')}
            </Button>
          </>
        }
      >
        <form
          id="suspend-form"
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field
            label={t('users.fields.days')}
            hint={daysOk ? t('users.untilHint', { date: fmtShortDay(suspensionUntil(daysNum)) }) : undefined}
            error={submitted && !daysOk ? t('users.errors.days') : undefined}
          >
            {(c) => <Input {...c} type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />}
          </Field>
          <Field label={t('users.fields.reason')} error={submitted && !reasonOk ? t('users.errors.reason') : undefined}>
            {(c) => <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          {suspend.isError && (
            <p role="alert" className="text-sm font-semibold text-danger-ink">
              {errorMessage(suspend.error, t)}
            </p>
          )}
        </form>
      </Modal>

      <UserFormModal
        open={editing !== undefined}
        user={editing ?? null}
        selfId={me?.id}
        onClose={() => setEditing(undefined)}
        onSaved={(u, kind) => void saved(u, kind)}
      />

      <Modal
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        size="sm"
        tone="danger"
        icon={<Trash2 className="h-5 w-5" aria-hidden />}
        title={t('users.deleteTitle', { name: deleting?.full_name ?? '' })}
        description={t('users.deleteBody')}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t('common.cancelAction')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {t('users.delete')}
            </Button>
          </>
        }
      >
        {remove.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {errorMessage(remove.error, t)}
          </p>
        )}
      </Modal>
    </>
  );
}
