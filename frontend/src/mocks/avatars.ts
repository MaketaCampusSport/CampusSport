import { HttpResponse } from 'msw';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Fotografia din corpul `AvatarUpload` (câmpul `file`), ca data: URL; `null` dacă nu e o imagine acceptată.
 * Serverul real o păstrează în baza de date și răspunde cu calea `/users/{id}/avatar?v=…`.
 */
export async function readAvatar(request: Request): Promise<string | null> {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string' || !TYPES.includes(file.type) || file.size > MAX_BYTES || file.size === 0) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${file.type};base64,${btoa(binary)}`;
}

export const imageInvalid = () =>
  HttpResponse.json(
    {
      code: 'IMAGE_INVALID',
      message_ro: 'Imaginea trebuie să fie JPEG, PNG sau WebP, de cel mult 2 MB.',
      message_en: 'The image must be a JPEG, PNG or WebP file of at most 2 MB.',
    },
    { status: 422 },
  );

/** `avatar_url` is `readOnly` in the contract (clients never write it); only the simulated server sets it. */
export function setAvatar(user: { readonly avatar_url?: string | null }, value: string | null): void {
  (user as { avatar_url?: string | null }).avatar_url = value;
}
