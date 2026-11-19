import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Card } from './Card';

type StatTone = 'ink' | 'brand' | 'success' | 'danger' | 'warn';

const valueTones: Record<StatTone, string> = {
  ink: 'text-ink',
  brand: 'text-brand-text',
  success: 'text-success',
  danger: 'text-danger',
  warn: 'text-warn-ink',
};

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  tone?: StatTone;
  /** Mică etichetă lângă valoare (ex. variația „+12%”). */
  aside?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, tone = 'ink', aside, className }: StatCardProps) {
  return (
    <Card className={cn('px-6 py-5', className)}>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className={cn('heading text-[40px] leading-none', valueTones[tone])}>{value}</span>
        {aside}
      </p>
    </Card>
  );
}
