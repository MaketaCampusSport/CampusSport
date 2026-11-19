import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/endpoints';
import type { AdminUser } from '@/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { LANGUAGES, setLanguage, type Language } from '@/i18n';
import { useUiStore, type ThemePreference } from '@/stores/uiStore';

const itemClass =
  'flex h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink outline-none data-[highlighted]:bg-subtle';
const labelClass = 'px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted';

export function UserMenu({ user }: { user: AdminUser }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  async function logout() {
    try {
      await api.auth.logout();
    } finally {
      queryClient.clear();
      navigate('/admin/login', { replace: true });
    }
  }

  const themes: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
    { value: 'system', label: t('menu.themeSystem'), Icon: Monitor },
    { value: 'light', label: t('menu.themeLight'), Icon: Sun },
    { value: 'dark', label: t('menu.themeDark'), Icon: Moon },
  ];

  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex w-full items-center gap-3 rounded-2xl bg-navy-2 px-3 py-3 text-left transition-colors hover:brightness-125"
        aria-label={t('menu.open')}
      >
        <Avatar name={user.fullName} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-bold text-white">{user.fullName}</span>
          <span className="block text-[13px] text-slate-400">{t('menu.role')}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side="top"
          align="start"
          sideOffset={10}
          className="z-50 w-[248px] rounded-2xl bg-surface p-2 shadow-pop ring-1 ring-line [animation:cs-pop-in_0.15s_ease-out]"
        >
          <Menu.Label className={labelClass}>{t('menu.language')}</Menu.Label>
          <Menu.RadioGroup value={i18n.language} onValueChange={(v) => setLanguage(v as Language)}>
            {LANGUAGES.map((lng) => (
              <Menu.RadioItem key={lng} value={lng} className={itemClass}>
                <span className="flex-1">{lng === 'ro' ? 'Română' : 'English'}</span>
                <Menu.ItemIndicator>
                  <Check className="h-4 w-4 text-brand-text" aria-hidden />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>

          <Menu.Separator className="my-2 h-px bg-line" />
          <Menu.Label className={labelClass}>{t('menu.theme')}</Menu.Label>
          <Menu.RadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
            {themes.map(({ value, label, Icon }) => (
              <Menu.RadioItem key={value} value={value} className={itemClass}>
                <Icon className="h-4 w-4 text-muted" aria-hidden />
                <span className="flex-1">{label}</span>
                <Menu.ItemIndicator>
                  <Check className="h-4 w-4 text-brand-text" aria-hidden />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>

          <Menu.Separator className="my-2 h-px bg-line" />
          <Menu.Item className={itemClass} onSelect={() => void logout()}>
            <LogOut className="h-4 w-4 text-muted" aria-hidden />
            {t('menu.logout')}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
