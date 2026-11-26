/** Tipurile acceptate de server (`AvatarUpload`); tipul real îl verifică serverul după conținut. */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Limita serverului (`IMAGE_INVALID` peste ea). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** Latura fotografiei trimise; destul pentru avatarul cel mai mare, cu ecrane retina. */
export const AVATAR_SIZE = 512;

export class ImageError extends Error {
  constructor(readonly reason: 'type' | 'size') {
    super(reason);
  }
}

/**
 * Pregătește fotografia de profil în browser: decupează centrul la pătrat, o micșorează la 512 px și o
 * trimite ca JPEG (de obicei sub 100 KB). Dacă browserul nu poate desena imaginea, se trimite fișierul
 * original, cât timp respectă limita serverului.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) throw new ImageError('type');
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const out = Math.min(AVATAR_SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('toBlob failed');
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  } catch {
    if (file.size > AVATAR_MAX_BYTES) throw new ImageError('size');
    return file;
  }
}
