import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

type ModalTone = 'danger' | 'warn' | 'brand' | 'success';

const toneClasses: Record<ModalTone, string> = {
  danger: 'bg-danger-soft text-danger-ink',
  warn: 'bg-warn-soft text-warn-ink',
  brand: 'bg-brand-soft text-brand-text',
  success: 'bg-success-soft text-success-ink',
};

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: ModalTone;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  footer?: ReactNode;
}

const sizes = { sm: 'max-w-[480px]', md: 'max-w-[600px]', lg: 'max-w-[720px]' };

/**
 * Fereastră modală accesibilă (Radix Dialog: focus blocat în interior, Esc închide,
 * titlu/descriere legate prin aria – SDD „Radix UI … accesibilitate WCAG AA pentru modale”).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  icon,
  tone = 'brand',
  size = 'md',
  children,
  footer,
}: ModalProps) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/60 backdrop-blur-[2px] [animation:cs-fade-in_0.15s_ease-out]" />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-4xl bg-surface p-8 shadow-pop [animation:cs-pop-in_0.18s_ease-out] focus:outline-none',
            sizes[size],
          )}
        >
          <div className="flex items-start gap-4">
            {icon && (
              <div
                className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', toneClasses[tone])}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="heading text-2xl leading-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : ''}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-ink"
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          {children && <div className="mt-6">{children}</div>}
          {footer && <div className="mt-8 flex flex-wrap items-center justify-end gap-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
