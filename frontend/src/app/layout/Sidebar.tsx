import {
  BarChart3,
  CalendarDays,
  LayoutGrid,
  Landmark,
  ListChecks,
  Lock,
  Megaphone,
  SlidersHorizontal,
  Star,
  Trophy,
  Users,
  ScanLine,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import type { AdminUser } from '@/api/types';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';
import { UserMenu } from './UserMenu';
import { USE_MOCKS } from '@/api/config';


interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Ordinea din machetă: Panoul zilei, Resurse, Orar EF, Evenimente, Blocări, Anunțuri, Rapoarte, Reguli, Jurnal audit. */
const NAV: NavItem[] = [
  { to: '/admin', labelKey: 'nav.dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/resources', labelKey: 'nav.resources', icon: Landmark },
  { to: '/admin/sports', labelKey: 'nav.sports', icon: Trophy },
  { to: '/admin/schedule', labelKey: 'nav.schedule', icon: CalendarDays },
  { to: '/admin/events', labelKey: 'nav.events', icon: Star },
  { to: '/admin/blocks', labelKey: 'nav.blocks', icon: Lock },
  { to: '/admin/announcements', labelKey: 'nav.announcements', icon: Megaphone },
  { to: '/admin/reports', labelKey: 'nav.reports', icon: BarChart3 },
  { to: '/admin/rules', labelKey: 'nav.rules', icon: SlidersHorizontal },
  { to: '/admin/audit', labelKey: 'nav.audit', icon: ListChecks },
  { to: '/admin/users', labelKey: 'nav.users', icon: Users },
  { to: '/admin/checkin', labelKey: 'nav.checkin', icon: ScanLine },
  { to: '/admin/account', labelKey: 'nav.account', icon: UserCog },
];

export function Sidebar({ user }: { user: AdminUser }) {
  const { t } = useTranslation();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[264px] flex-col bg-navy px-4 py-6">
      <div className="px-2">
        <Logo />
        {USE_MOCKS && (
          <span className="mt-3 inline-block rounded-full bg-sun px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-onsun">
            Demo
          </span>
        )}
      </div>

      <nav aria-label={t('nav.label')} className="mt-8 flex-1 space-y-1 overflow-y-auto">
        {NAV.map(({ to, labelKey, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex h-[52px] items-center gap-3.5 rounded-2xl px-4 text-[15px] font-semibold transition-colors',
                isActive ? 'bg-brand text-white' : 'text-slate-300 hover:bg-navy-2 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-5 w-5', isActive && 'text-sun')} aria-hidden />
                {t(labelKey)}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <UserMenu user={user} />
    </aside>
  );
}
