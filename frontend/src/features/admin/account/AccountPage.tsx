import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth/sessionStore';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * Contul administratorului (NFR-08). TOTP se configurează pe server, din linia de comandă
 * (`npm run admin:enroll-totp -- <email>`): contractul API nu are rute de configurare 2FA.
 */
export default function AccountPage() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  if (!user) return null;

  return (
    <>
      <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />
      <div className="grid grid-cols-2 gap-6">
        <Card className="p-6">
          <p className="eyebrow">{t('account.sessionTitle')}</p>
          <p className="mt-2 text-xl font-bold text-ink">{user.full_name}</p>
          <p className="text-[15px] text-muted">
            {t('account.email')}: {user.email}
          </p>
          <p className="mt-3 text-[15px] text-muted">{t('account.sessionLength')}</p>
        </Card>

        <Card className="p-6">
          <p className="eyebrow flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {t('account.twofaTitle')}
          </p>
          <p className="mt-2 text-[15px] text-muted">{t('account.twofaBody')}</p>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-subtle p-4 text-sm font-semibold text-ink">
            <code>{`cd backend\nnpm run admin:enroll-totp -- ${user.email}`}</code>
          </pre>
          <p className="mt-3 text-sm text-muted">{t('account.twofaNote')}</p>
        </Card>
      </div>
    </>
  );
}
