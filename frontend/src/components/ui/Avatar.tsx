import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

interface AvatarProps {
  name: string;
  /** `accent` = galben (administratorul curent), `soft` = albastru deschis (ceilalți). */
  tone?: 'accent' | 'soft';
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ name, tone = 'accent', size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-extrabold',
        size === 'md' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs',
        tone === 'accent' ? 'bg-sun text-onsun' : 'bg-brand-soft text-brand-text',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
