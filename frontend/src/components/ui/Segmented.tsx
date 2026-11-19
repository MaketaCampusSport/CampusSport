import * as ToggleGroup from '@radix-ui/react-toggle-group';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: Option<T>[];
  'aria-label': string;
  className?: string;
}

/** Comutator „segmentat” (ex. Până la noi ordine / Interval fix). Mereu are o valoare selectată. */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...rest
}: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={rest['aria-label']}
      className={cn('flex gap-1 rounded-2xl bg-subtle p-1', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="h-10 flex-1 rounded-xl px-4 text-sm font-semibold text-muted transition-colors hover:text-ink data-[state=on]:bg-surface data-[state=on]:font-bold data-[state=on]:text-ink data-[state=on]:shadow-card"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
