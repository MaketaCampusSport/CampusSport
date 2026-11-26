import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

interface AvatarProps {
  name: string;
  /** Fotografia de profil (`User.avatar_url`); fără ea, sau dacă nu se încarcă, apar inițialele. */
  src?: string | null;
  /** `accent` = galben (administratorul curent), `soft` = albastru deschis (ceilalți). */
  tone?: 'accent' | 'soft';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = { sm: 'h-9 w-9 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-20 w-20 text-xl' } as const;

export function Avatar({ name, src, tone = 'accent', size = 'md', className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  const base = cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold', SIZES[size], className);

  if (src && !broken) {
    return <img src={src} alt="" aria-hidden className={cn(base, 'bg-subtle object-cover')} onError={() => setBroken(true)} />;
  }
  return (
    <span aria-hidden className={cn(base, tone === 'accent' ? 'bg-sun text-onsun' : 'bg-brand-soft text-brand-text')}>
      {initials(name)}
    </span>
  );
}
