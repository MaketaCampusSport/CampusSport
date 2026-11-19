import { ChevronDown } from 'lucide-react';
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  /** Eticheta ascunsă vizual (dar citită de cititoarele de ecran). */
  srOnlyLabel?: boolean;
  children: (control: FieldControlProps) => ReactNode;
}

/** Etichetă + control + mesaj de ajutor/eroare, legate accesibil prin id / aria-describedby. */
export function Field({ label, hint, error, className, srOnlyLabel, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={id} className={cn('block text-sm font-semibold text-ink', srOnlyLabel && 'sr-only')}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const controlClasses =
  'h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[15px] text-ink transition-colors placeholder:text-muted/70 hover:border-muted/50 focus-visible:border-brand aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(controlClasses, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea ref={ref} className={cn(controlClasses, 'h-auto min-h-[120px] resize-y py-3', className)} {...rest} />
    );
  },
);

/** <select> nativ (accesibil, funcționează bine pe orice browser) cu aspectul din machetă. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(controlClasses, 'appearance-none pr-11', className)} {...rest}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  );
});
