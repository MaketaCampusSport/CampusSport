import { NavLink } from 'react-router';
import { Calendar, Home, Search, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export type UserNavTab = 'home' | 'search' | 'bookings' | 'profile';

interface BottomNavProps {
  activeTab?: UserNavTab;
  onTabChange?: (tab: UserNavTab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { t } = useTranslation();

  const items: {
    id: UserNavTab;
    to: string;
    label: string;
    icon: typeof Home;
    end?: boolean;
  }[] = [
    { id: 'home', to: '/user', label: t('user.nav.home'), icon: Home, end: true },
    { id: 'search', to: '/user/search', label: t('user.nav.search'), icon: Search },
    { id: 'bookings', to: '/user/bookings', label: t('user.nav.bookings'), icon: Calendar },
    { id: 'profile', to: '/user/profile', label: t('user.nav.profile'), icon: User },
  ];

  const itemClasses = (isActive: boolean) =>
    cn(
      'min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
      isActive ? 'font-bold text-brand-text' : 'font-semibold text-muted hover:text-ink',
    );

  return (
    <nav
      aria-label={t('user.nav.label')}
      className="grid shrink-0 grid-cols-4 border-t border-line bg-surface px-2 py-1.5"
    >
      {items.map(({ id, to, label, icon: Icon, end }) => {
        if (onTabChange) {
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={itemClasses(activeTab === id)}
            >
              <Icon size={20} strokeWidth={2.2} />
              <span>{label}</span>
            </button>
          );
        }

        return (
          <NavLink
            key={id}
            to={to}
            end={end}
            className={({ isActive }) => itemClasses(isActive)}
          >
            <Icon size={20} strokeWidth={2.2} />
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}