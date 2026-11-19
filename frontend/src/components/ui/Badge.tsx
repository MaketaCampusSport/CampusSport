import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'brand' | 'success' | 'danger' | 'warn' | 'neutral' | 'solid-danger';

const tones: Record<BadgeTone, string> = {
  brand: 'bg-brand-soft text-brand-text',
  success: 'bg-success-soft text-success-ink',
  danger: 'bg-danger-soft text-danger-ink',
  warn: 'bg-warn-soft text-warn-ink',
  neutral: 'bg-subtle text-muted',
  'solid-danger': 'bg-danger-strong text-white',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
