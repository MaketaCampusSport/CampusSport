import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { Spinner } from '@/components/ui/feedback';
import { useSession } from '@/features/admin/auth/useSession';
import { Sidebar } from './Sidebar';

/** Cadrul panoului de administrare: bară laterală fixă + zona de conținut (UI-08, desktop). */
export function AdminLayout() {
  const { t } = useTranslation();
  const { data } = useSession();
  if (!data) return null;

  return (
    <div className="min-h-screen min-w-[1100px]" >
      
      <a
        href="#main"
        className="sr-only z-[80] rounded-full bg-sun px-5 py-3 font-bold text-onsun focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('nav.skip')}
      </a>
      <Sidebar user={data.user} />
      <main id="main" tabIndex={-1} className="min-h-screen pl-[264px] focus:outline-none">
        <div className="mx-auto max-w-[1480px] px-11 pb-16 pt-10">
          <Suspense
            fallback={
              <div className="flex justify-center py-32">
                <Spinner className="h-8 w-8" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
