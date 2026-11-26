import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { client, type Role, type User, type UserUpdate } from '@/api/client';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '../shared/errors';

const ROLES: Role[] = ['student', 'teacher', 'external', 'admin'];
const E164 = /^\+[1-9]\d{7,14}$/;
const MIN_PASSWORD = 8;

interface Draft {
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
}

const EMPTY: Draft = { full_name: '', email: '', phone: '', role: 'student', password: '' };

/** Erorile de validare din formular (aceleași reguli ca `UserCreate` / `UserUpdate`). */
export function validateUserDraft(d: Draft, creating: boolean): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (d.full_name.trim().length < 2) errors.full_name = 'users.errors.fullName';
  if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) errors.email = 'users.errors.email';
  const phone = d.phone.trim();
  if (phone && !E164.test(phone)) errors.phone = 'users.errors.phone';
  else if (!phone && d.role === 'external') errors.phone = 'users.errors.phoneExternal';
  if ((creating || d.password) && d.password.length < MIN_PASSWORD) errors.password = 'users.errors.password';
  return errors;
}

/** Doar câmpurile schimbate, pentru PATCH /admin/users/{id}. */
export function userChanges(user: User, d: Draft): UserUpdate {
  const changes: UserUpdate = {};
  if (d.full_name.trim() !== user.full_name) changes.full_name = d.full_name.trim();
  if (d.email.trim().toLowerCase() !== user.email) changes.email = d.email.trim();
  const phone = d.phone.trim() || null;
  if (phone !== (user.phone ?? null)) changes.phone = phone;
  if (d.role !== user.role) changes.role = d.role;
  if (d.password) changes.password = d.password;
  return changes;
}

interface UserFormModalProps {
  /** `null` = cont nou; altfel contul editat. */
  user: User | null;
  open: boolean;
  /** Administratorul conectat: nu își poate schimba propriul rol. */
  selfId?: string;
  onClose: () => void;
  /** După creare, modificare sau schimbarea fotografiei. */
  onSaved: (user: User, kind: 'created' | 'updated' | 'photo') => void;
}

/** Crearea și editarea unui cont, cu fotografia de profil (FR-05). */
export function UserFormModal({ user, open, selfId, onClose, onSaved }: UserFormModalProps) {
  const { t } = useTranslation();
  const creating = user === null;
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  /** Fotografia aleasă pentru un cont nou; se încarcă după creare. */
  const [pendingPhoto, setPendingPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** `avatar_url` curent al contului editat (se schimbă fără să închidem fereastra). */
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(user ? { full_name: user.full_name, email: user.email, phone: user.phone ?? '', role: user.role, password: '' } : EMPTY);
    setAvatarUrl(user?.avatar_url ?? null);
    setSubmitted(false);
    setPendingPhoto(null);
  }, [open, user]);

  useEffect(() => {
    if (!pendingPhoto) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingPhoto);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingPhoto]);

  const save = useMutation({
    mutationFn: async (): Promise<User> => {
      if (creating) {
        const created = await client.admin.createUser({
          full_name: draft.full_name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim() || null,
          role: draft.role,
          password: draft.password,
        });
        // Contul există deja; dacă fotografia nu trece, administratorul o poate încărca din editare.
        return pendingPhoto ? client.admin.uploadUserAvatar(created.id, pendingPhoto).catch(() => created) : created;
      }
      return client.admin.updateUser(user.id, userChanges(user, draft));
    },
    onSuccess: (saved) => onSaved(saved, creating ? 'created' : 'updated'),
  });

  const photo = useMutation({
    mutationFn: (image: Blob | null) =>
      image ? client.admin.uploadUserAvatar(user!.id, image) : client.admin.deleteUserAvatar(user!.id),
    onSuccess: (saved) => {
      setAvatarUrl(saved.avatar_url ?? null);
      onSaved(saved, 'photo');
    },
  });

  const errors = validateUserDraft(draft, creating);
  const show = (k: keyof Draft) => (submitted && errors[k] ? t(errors[k]!) : undefined);
  const isSelf = !creating && user.id === selfId;
  const nothingChanged = !creating && Object.keys(userChanges(user, draft)).length === 0;

  function submit() {
    setSubmitted(true);
    if (Object.keys(errors).length || nothingChanged) return;
    save.mutate();
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      size="md"
      title={creating ? t('users.form.createTitle') : t('users.form.editTitle', { name: user.full_name })}
      description={creating ? t('users.form.createBody') : t('users.form.editBody')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancelAction')}
          </Button>
          <Button type="submit" form="user-form" variant="primary" loading={save.isPending} disabled={nothingChanged}>
            {creating ? t('users.form.create') : t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <AvatarPicker
          name={draft.full_name || '?'}
          src={creating ? preview : avatarUrl}
          busy={photo.isPending}
          error={photo.isError ? errorMessage(photo.error, t) : undefined}
          onPick={(image) => (creating ? setPendingPhoto(image) : photo.mutate(image))}
          onRemove={creating ? () => setPendingPhoto(null) : () => photo.mutate(null)}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('users.fields.fullName')} error={show('full_name')}>
            {(c) => <Input {...c} value={draft.full_name} onChange={(e) => set('full_name', e.target.value)} autoComplete="off" />}
          </Field>
          <Field label={t('users.fields.email')} error={show('email')}>
            {(c) => <Input {...c} type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />}
          </Field>
          <Field label={t('users.fields.role')} hint={isSelf ? t('users.form.ownRole') : undefined}>
            {(c) => (
              <Select {...c} value={draft.role} disabled={isSelf} onChange={(e) => set('role', e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`users.roles.${r}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t('users.fields.phone')}
            hint={draft.role === 'external' ? t('users.form.phoneRequired') : t('users.form.phoneOptional')}
            error={show('phone')}
          >
            {(c) => <Input {...c} type="tel" placeholder="+373…" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />}
          </Field>
        </div>

        <Field
          label={creating ? t('users.fields.password') : t('users.fields.newPassword')}
          hint={creating ? t('users.form.passwordHint') : t('users.form.newPasswordHint')}
          error={show('password')}
        >
          {(c) => (
            <Input {...c} type="password" value={draft.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          )}
        </Field>

        {save.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {errorMessage(save.error, t)}
          </p>
        )}
      </form>
    </Modal>
  );
}
