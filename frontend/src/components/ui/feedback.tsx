import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function Spinner({ className }: { className?: string }) {
  const { t } = useTranslation();
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} aria-label={t('common.loading')} />;
}

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-2xl bg-line/70', className)} {...rest} />;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-subtle text-muted">{icon}</div>
      )}
      <p className="heading text-lg">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-ink">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <p className="heading text-lg">{t('errors.loadTitle')}</p>
      <p className="max-w-sm text-sm text-muted">{message ?? t('errors.loadBody')}</p>
      {onRetry && (
        <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

type BannerTone = 'success' | 'warn' | 'danger' | 'info';

const bannerTones: Record<BannerTone, { box: string; icon: string; Icon: typeof Info }> = {
  success: { box: 'bg-success-soft', icon: 'bg-success text-white', Icon: CheckCircle2 },
  warn: { box: 'bg-warn-soft', icon: 'text-warn-ink', Icon: AlertTriangle },
  danger: { box: 'bg-danger-soft', icon: 'text-danger-ink', Icon: AlertTriangle },
  info: { box: 'bg-brand-soft', icon: 'text-brand-text', Icon: Info },
};

interface BannerProps {
  tone: BannerTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
}

/** Bară de mesaj cu pictogramă (confirmări, avertismente despre conflicte etc.). */
export function Banner({ tone, title, children, action, className, role }: BannerProps) {
  const { box, icon, Icon } = bannerTones[tone];
  const solid = tone === 'success';
  return (
    <div role={role} className={cn('flex items-center gap-4 rounded-3xl px-5 py-4', box, className)}>
      <div
        className={cn(
          'flex shrink-0 items-center justify-center',
          solid ? 'h-11 w-11 rounded-full' : 'h-7 w-7',
          icon,
        )}
      >
        <Icon className={solid ? 'h-6 w-6' : 'h-6 w-6'} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[15px] font-extrabold',
            tone === 'success' && 'text-success-ink',
            tone === 'warn' && 'text-warn-ink',
            tone === 'danger' && 'text-danger-ink',
            tone === 'info' && 'text-brand-text',
          )}
        >
          {title}
        </p>
        {children && (
          <div
            className={cn(
              'mt-0.5 text-sm',
              tone === 'success' && 'text-success-ink',
              tone === 'warn' && 'text-warn-ink',
              tone === 'danger' && 'text-danger-ink',
              tone === 'info' && 'text-brand-text',
            )}
          >
            {children}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
