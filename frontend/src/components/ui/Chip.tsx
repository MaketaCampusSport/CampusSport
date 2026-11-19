import { Check } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}

/** Buton-etichetă comutabil (sporturi permise, dotări, canale, resurse…). */
export function Chip({ pressed, onPressedChange, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors',
        pressed
          ? 'border-brand bg-brand text-white'
          : 'border-line bg-surface text-ink hover:bg-subtle',
        className,
      )}
      {...rest}
    >
      {pressed && <Check className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
}

/** Adaugă sau scoate o valoare dintr-o listă (utilitar pentru grupuri de Chip-uri). */
export function toggleInList<T>(list: readonly T[], value: T, on: boolean): T[] {
  const without = list.filter((v) => v !== value);
  return on ? [...without, value] : without;
}
