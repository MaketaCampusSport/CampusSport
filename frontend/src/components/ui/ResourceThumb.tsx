import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

interface ResourceThumbProps {
  src: string;
  className?: string;
  /** Imaginea e decorativă când numele resursei apare lângă ea. */
  alt?: string;
}

export function ResourceThumb({ src, className, alt = '' }: ResourceThumbProps) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <span
        aria-hidden
        className={cn('inline-flex shrink-0 items-center justify-center rounded-xl bg-subtle text-muted', className)}
      >
        <ImageOff className="h-1/2 w-1/2" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-xl object-cover', className)}
    />
  );
}
