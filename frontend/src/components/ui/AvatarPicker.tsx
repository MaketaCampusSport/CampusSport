import { Camera, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AVATAR_TYPES, ImageError, prepareAvatar } from '@/lib/image';
import { Avatar } from './Avatar';
import { Button } from './Button';

interface AvatarPickerProps {
  name: string;
  src?: string | null;
  /** Primește fotografia deja micșorată; apelantul o trimite la server. */
  onPick: (image: Blob) => void;
  /** Lipsește când nu există ce șterge (ex. un cont încă necreat). */
  onRemove?: () => void;
  busy?: boolean;
  /** Eroarea serverului, afișată sub butoane. */
  error?: string;
  tone?: 'accent' | 'soft';
}

/** Fotografia de profil cu butoanele „Schimbă” și „Șterge” (profilul utilizatorului și panoul de administrare). */
export function AvatarPicker({ name, src, onPick, onRemove, busy, error, tone = 'soft' }: AvatarPickerProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [localError, setLocalError] = useState<string>();

  async function picked(file: File | undefined) {
    if (!file) return;
    setLocalError(undefined);
    try {
      onPick(await prepareAvatar(file));
    } catch (e) {
      setLocalError(e instanceof ImageError && e.reason === 'size' ? t('avatar.errors.size') : t('avatar.errors.type'));
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  const message = localError ?? error;

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={src} tone={tone} size="lg" />
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={busy}
            leftIcon={<Camera className="h-4 w-4" aria-hidden />}
            onClick={() => input.current?.click()}
            aria-describedby={message ? errorId : undefined}
          >
            {src ? t('avatar.change') : t('avatar.add')}
          </Button>
          {src && onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}
              onClick={onRemove}
            >
              {t('avatar.remove')}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">{t('avatar.hint')}</p>
        {message && (
          <p id={errorId} role="alert" className="text-sm font-semibold text-danger-ink">
            {message}
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept={AVATAR_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-label={src ? t('avatar.change') : t('avatar.add')}
          onChange={(e) => void picked(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
