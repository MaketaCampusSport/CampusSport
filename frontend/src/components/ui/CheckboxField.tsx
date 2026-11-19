import * as Checkbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CheckboxFieldProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function CheckboxField({ checked, onCheckedChange, label, disabled, className }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Checkbox.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-surface transition-colors data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:opacity-50"
      >
        <Checkbox.Indicator>
          <Check className="h-4 w-4 text-white" strokeWidth={3} aria-hidden />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label htmlFor={id} className="cursor-pointer text-[15px] font-medium text-ink">
        {label}
      </label>
    </div>
  );
}
