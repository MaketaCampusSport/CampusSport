import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { client } from '@/api/client';
import type { NotificationPreferences } from '@/api/generated';
import { ApiError } from '@/api/http';
import { useSession } from '@/auth/sessionStore';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CheckboxField } from '@/components/ui/CheckboxField';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { LANGUAGES, setLanguage, type Language } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { useUiStore, type ThemePreference } from '@/stores/uiStore';
import { ScreenHeader } from '../MemberLayout';
import { useNotificationPreferences, useQuota, useUpdateNotificationPreferences } from '../queries';

const CHANNELS = ['push', 'email', 'sms'] as const;

/** Canalele de notificare și limba mesajelor (FR-35, FR-37). */
function NotificationsCard() {
  const { t } = useTranslation();
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  function change(next: Partial<NotificationPreferences>) {
    if (!prefs.data) return;
    update.mutate(
      { ...prefs.data, ...next },
      { onSuccess: () => toast.success(t('user.profile.prefsSaved')), onError: () => toast.error(t('errors.generic')) },
    );
  }

  return (
    <Card className="border border-line/60 p-4">
      <h2 className="text-sm font-bold text-ink">{t('user.profile.notificationsTitle')}</h2>
      <p className="mt-0.5 text-xs text-muted">{t('user.profile.notificationsBody')}</p>
      {prefs.isPending ? (
        <Skeleton className="mt-3 h-24 rounded-2xl" />
      ) : prefs.isError ? (
        <ErrorState onRetry={() => void prefs.refetch()} />
      ) : (
        <div className="mt-3 space-y-3">
          {CHANNELS.map((ch) => (
            <CheckboxField
              key={ch}
              checked={prefs.data[ch]}
              disabled={update.isPending}
              onCheckedChange={(v) => change({ [ch]: v })}
              label={t(`user.profile.channel.${ch}`)}
            />
          ))}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">{t('user.profile.messageLanguage')}</p>
            <Segmented
              aria-label={t('user.profile.messageLanguage')}
              value={prefs.data.language ?? 'ro'}
              onValueChange={(language) => change({ language })}
              options={[
                { value: 'ro', label: 'Română' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

/** Profilul utilizatorului: date de cont, cotă, preferințe, deconectare și ștergerea contului (FR-04). */
export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const clear = useSession((s) => s.clear);
  const quota = useQuota();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function signedOut() {
    clear();
    qc.clear();
    navigate('/login', { replace: true });
  }

  const logout = useMutation({ mutationFn: () => client.auth.logout(), onSettled: signedOut });
  const remove = useMutation({
    mutationFn: () => client.me.remove(),
    onSuccess: () => {
      toast.success(t('user.profile.deleted'));
      signedOut();
    },
  });

  if (!user) return null;

  return (
    <div className="flex-1 pb-6">
      <ScreenHeader eyebrow={t('user.profile.eyebrow')} title={t('user.profile.title')} />
      <div className="space-y-4 px-4 pt-2">
        <Card className="flex items-center gap-3 border border-line/60 p-4">
          <Avatar name={user.full_name} tone="accent" size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-ink">{user.full_name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <Badge tone="brand">{t(`auth.roles.${user.role}`)}</Badge>
        </Card>

        {user.role === 'student' && quota.data && (
          <Card className="border border-line/60 p-4">
            <h2 className="text-sm font-bold text-ink">{t('user.profile.quotaTitle')}</h2>
            <p className="mt-1 text-xs text-muted">
              {t('user.profile.quotaBody', { remaining: quota.data.remaining, limit: quota.data.limit, refunded: quota.data.refunded })}
            </p>
          </Card>
        )}

        <NotificationsCard />

        <Card className="space-y-3 border border-line/60 p-4">
          <h2 className="text-sm font-bold text-ink">{t('user.profile.appTitle')}</h2>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">{t('menu.language')}</p>
            <Segmented
              aria-label={t('menu.language')}
              value={(i18n.language as Language) ?? 'ro'}
              onValueChange={(v) => setLanguage(v)}
              options={LANGUAGES.map((l) => ({ value: l, label: l === 'ro' ? 'Română' : 'English' }))}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">{t('menu.theme')}</p>
            <Segmented<ThemePreference>
              aria-label={t('menu.theme')}
              value={theme}
              onValueChange={setTheme}
              options={[
                { value: 'system', label: t('menu.themeSystem') },
                { value: 'light', label: t('menu.themeLight') },
                { value: 'dark', label: t('menu.themeDark') },
              ]}
            />
          </div>
        </Card>

        <Card className="space-y-2 border border-line/60 p-4">
          <h2 className="text-sm font-bold text-ink">{t('user.profile.dataTitle')}</h2>
          <p className="text-xs text-muted">{t('user.profile.exportUnavailable')}</p>
        </Card>

        <div className="space-y-2.5 pt-2">
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            loading={logout.isPending}
            leftIcon={<LogOut size={18} aria-hidden />}
            onClick={() => logout.mutate()}
          >
            {t('menu.logout')}
          </Button>
          <Button variant="ghost" size="md" className="w-full text-danger-ink" leftIcon={<Trash2 size={16} aria-hidden />} onClick={() => setConfirmDelete(true)}>
            {t('user.profile.delete')}
          </Button>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        size="sm"
        title={t('user.profile.deleteTitle')}
        description={t('user.profile.deleteBody')}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t('common.cancelAction')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t('user.profile.deleteConfirm')}
            </Button>
          </>
        }
      >
        {remove.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {remove.error instanceof ApiError ? remove.error.message : t('errors.generic')}
          </p>
        )}
      </Modal>
    </div>
  );
}
