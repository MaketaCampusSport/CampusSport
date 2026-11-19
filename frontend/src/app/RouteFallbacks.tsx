import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center">
      <EmptyState
        icon={<Compass className="h-6 w-6" aria-hidden />}
        title={t('errors.notFoundTitle')}
        description={t('errors.notFoundBody')}
        action={
          <Link to="/admin" className={buttonClasses('primary', 'md', 'mt-2')}>
            {t('errors.backToDashboard')}
          </Link>
        }
      />
    </div>
  );
}

/** Eroare neașteptată la randarea unei rute (în loc de ecran alb). */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined;
  return (
    <div className="flex min-h-screen items-center justify-center">
      <ErrorState message={message} onRetry={() => window.location.reload()} />
    </div>
  );
}
