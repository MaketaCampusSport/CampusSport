import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useToastStore, type Toast } from '@/stores/toastStore';

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
const accents = {
  success: 'text-success-ink bg-success-soft',
  error: 'text-danger-ink bg-danger-soft',
  info: 'text-brand-text bg-brand-soft',
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const { t } = useTranslation();
  const Icon = icons[toast.tone];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), toast.tone === 'error' ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.tone, dismiss]);

  return (
    <div className="pointer-events-auto flex w-[380px] items-start gap-3 rounded-2xl bg-surface p-4 shadow-pop ring-1 ring-line [animation:cs-slide-in_0.2s_ease-out]">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', accents[toast.tone])}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-bold text-ink">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-sm text-muted">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label={t('common.close')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Notificări scurte, anunțate cititoarelor de ecran (aria-live). */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col gap-3"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
