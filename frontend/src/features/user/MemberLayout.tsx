import { Suspense, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { BottomNav } from '@/components/BottomNav';
import { Spinner } from '@/components/ui/feedback';

/** Cadrul PWA pentru studenți, profesori și externi: o coloană de telefon + navigarea de jos (UI-02). */
export function MemberLayout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col border-x border-line bg-subtle shadow-card">
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center py-24">
              <Spinner className="h-8 w-8" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </div>
      <div className="sticky bottom-0 z-30">
        <BottomNav />
      </div>
    </div>
  );
}

/** Antetul comun al ecranelor din aplicație. */
export function ScreenHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-4 pb-2 pt-6">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{eyebrow}</p>}
        <h1 className="heading mt-0.5 truncate text-3xl leading-tight text-ink">{title}</h1>
      </div>
      {action}
    </header>
  );
}
