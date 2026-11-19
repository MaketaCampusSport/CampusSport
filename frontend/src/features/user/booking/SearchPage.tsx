import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Slot } from '@/api/generated';
import { ApiError } from '@/api/http';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, ErrorState, Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import { dayKey, fmtDayLong, fmtDayNumber, fmtTime, fmtWeekdayShort, langOf, nextDays, sportName } from '../lib';
import { useAvailability, useJoinWaitlist, useSports } from '../queries';

/** Cum se afișează un slot (FR-09). `waitlist` = ocupat, dar te poți înscrie pe lista de așteptare (FR-27). */
export type SlotView = 'free' | 'waitlist' | 'mine' | 'pe_class' | 'unavailable';

export function slotView(s: Slot): SlotView {
  if (s.status === 'mine') return 'mine';
  if (s.status === 'free') return s.bookable ? 'free' : 'unavailable';
  if (s.status === 'blocked') return s.block_kind === 'pe_class' ? 'pe_class' : 'unavailable';
  return s.waitlist_available ? 'waitlist' : 'unavailable';
}

const DAYS_SHOWN = 7;
const COLLAPSED = 6;

/** Pasul 1 din 3: terenul și ora (UI Design p. 17). Sportul și ziua stau în URL (`?sport=&date=`). */
export default function SearchPage() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sports = useSports();
  const sportId = params.get('sport') ?? sports.data?.[0]?.id ?? '';
  const days = useMemo(() => nextDays(DAYS_SHOWN), []);
  const date = params.get('date') ?? dayKey();

  const [selected, setSelected] = useState<{ resourceId: string; slot: Slot } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const availability = useAvailability(sportId, date);
  const waitlist = useJoinWaitlist();

  const resources = availability.data?.resources ?? [];

  const sport = sports.data?.find((s) => s.id === sportId);
  const title = sportName(sport, lang) || t('user.nav.search');

  function update(next: { sport?: string; date?: string }) {
    const p = new URLSearchParams(params);
    if (next.sport) p.set('sport', next.sport);
    if (next.date) p.set('date', next.date);
    setParams(p, { replace: true });
    setSelected(null);
    waitlist.reset();
  }

  const view = selected ? slotView(selected.slot) : null;
  const resourceName = resources.find((r) => r.resource_id === selected?.resourceId)?.resource_name ?? '';

  function proceed() {
    if (!selected) return;
    const { resourceId, slot } = selected;
    if (view === 'free') {
      const q = new URLSearchParams({ start: slot.start, end: slot.end, sport: sportId });
      navigate(`/user/book/${encodeURIComponent(resourceId)}?${q}`);
    } else if (view === 'waitlist') {
      waitlist.mutate({ day: date, resource_id: resourceId, start: slot.start, end: slot.end });
    }
  }

  const slotStyle = (v: SlotView, isSelected: boolean) => {
    if (isSelected) return { box: 'border-2 border-ink bg-sun text-onsun shadow-card', label: t('user.availability.slot.selected'), tone: 'font-bold text-onsun' };
    switch (v) {
      case 'free':
        return { box: 'border border-line bg-surface text-ink hover:border-brand', label: t('user.availability.slot.free'), tone: 'font-medium text-muted' };
      case 'waitlist':
        return { box: 'border border-dashed border-brand/50 bg-surface text-ink hover:border-brand', label: t('user.availability.slot.waitlist'), tone: 'font-semibold text-brand-text' };
      case 'mine':
        return { box: 'border border-brand bg-brand text-white', label: t('user.availability.slot.myBooking'), tone: 'font-semibold text-white/90' };
      case 'pe_class':
        return { box: 'border border-warn-ink/20 bg-warn-soft text-warn-ink', label: t('user.availability.slot.peClass'), tone: 'font-semibold text-warn-ink' };
      default:
        return { box: 'border border-transparent bg-subtle text-muted/60', label: t('user.availability.slot.occupied'), tone: 'font-medium text-muted/60' };
    }
  };

  const waitlistError =
    waitlist.error instanceof ApiError && waitlist.error.code === 'ALREADY_ON_WAITLIST'
      ? t('user.availability.alreadyOnWaitlist')
      : waitlist.error instanceof ApiError
        ? waitlist.error.message
        : waitlist.error
          ? t('errors.generic')
          : null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/user"
            aria-label={t('user.availability.backAria')}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-subtle"
          >
            <ChevronLeft size={22} strokeWidth={2.5} aria-hidden />
          </Link>
          <span className="text-[11px] font-bold uppercase tracking-widest text-brand-text">{t('user.availability.stepTitle')}</span>
          <span className="w-11" aria-hidden />
        </div>

        <h1 className="heading mt-1 text-3xl uppercase tracking-wide text-ink">{title}</h1>

        {(sports.data?.length ?? 0) > 1 && (
          <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={t('user.availability.sportAria')}>
            {sports.data!.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === sportId}
                onClick={() => update({ sport: s.id })}
                className={cn(
                  'h-9 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors',
                  s.id === sportId ? 'bg-ink text-surface' : 'bg-subtle text-ink hover:bg-line/60',
                )}
              >
                {sportName(s, lang)}
              </button>
            ))}
          </div>
        )}

        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 pt-2" role="group" aria-label={t('user.availability.selectDayAria')}>
          {days.map((day) => {
            const isSelected = day.key === date;
            return (
              <button
                key={day.key}
                type="button"
                aria-pressed={isSelected}
                aria-label={fmtDayLong(day.noon, lang)}
                onClick={() => update({ date: day.key })}
                className={cn(
                  'flex min-h-[60px] min-w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl px-2.5 py-2 transition-all',
                  isSelected ? 'bg-brand text-white shadow-card' : 'bg-subtle text-ink hover:bg-line/60',
                )}
              >
                <span className={cn('text-[10px] font-bold uppercase tracking-wider', isSelected ? 'text-white/90' : 'text-muted')}>
                  {fmtWeekdayShort(day.noon, lang)}
                </span>
                <span className="heading mt-0.5 text-xl leading-tight">{fmtDayNumber(day.noon)}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex-1 space-y-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">{t('user.availability.chooseCourtAndTime')}</h2>
          {availability.isSuccess && (
            <span className="text-xs font-semibold text-muted">{t('user.availability.courtCount', { count: resources.length })}</span>
          )}
        </div>

        {waitlist.isSuccess && (
          <Banner tone="success" title={t('user.confirm.errors.waitlistJoinedTitle')} role="status">
            {t('user.confirm.errors.waitlistJoinedBody')}
          </Banner>
        )}
        {waitlistError && <Banner tone="danger" title={waitlistError} role="alert" />}

        {!sportId || availability.isPending ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <Card key={n} className="space-y-3 border border-line/60 p-4">
                <Skeleton className="h-5 w-40 rounded-lg" />
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Skeleton className="h-[54px] rounded-xl" />
                  <Skeleton className="h-[54px] rounded-xl" />
                  <Skeleton className="h-[54px] rounded-xl" />
                </div>
              </Card>
            ))}
          </div>
        ) : availability.isError ? (
          <Card className="border border-line/60">
            <ErrorState onRetry={() => void availability.refetch()} className="py-10" />
          </Card>
        ) : resources.length === 0 ? (
          <Card className="border border-line/60 p-6 text-center">
            <p className="text-sm font-bold text-ink">{t('user.availability.emptyTitle')}</p>
            <p className="mt-1 text-xs text-muted">{t('user.availability.emptyBody', { sport: title })}</p>
          </Card>
        ) : (
          resources.map((resource) => {
            const isExpanded = !!expanded[resource.resource_id];
            const slots = isExpanded ? resource.slots : resource.slots.slice(0, COLLAPSED);
            return (
              <Card key={resource.resource_id} aria-label={resource.resource_name} className="border border-line/60 p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold leading-tight text-ink">{resource.resource_name}</h3>
                  {resource.slots.length > COLLAPSED && (
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [resource.resource_id]: !p[resource.resource_id] }))}
                      className="min-h-[36px] shrink-0 px-1 text-xs font-bold text-brand-text hover:underline"
                    >
                      {isExpanded ? t('user.availability.showLess') : t('user.availability.showMore')}
                    </button>
                  )}
                </div>
                {resource.slots.length === 0 ? (
                  <p className="text-xs text-muted">{t('user.availability.closed')}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('user.availability.slotsAria', { name: resource.resource_name })}>
                    {slots.map((slot) => {
                      const v = slotView(slot);
                      const isSelected = selected?.resourceId === resource.resource_id && selected.slot.start === slot.start;
                      const style = slotStyle(v, isSelected);
                      const selectable = v === 'free' || v === 'waitlist';
                      return (
                        <button
                          key={slot.start}
                          type="button"
                          disabled={!selectable}
                          aria-pressed={isSelected}
                          onClick={() => {
                            waitlist.reset();
                            setSelected(isSelected ? null : { resourceId: resource.resource_id, slot });
                          }}
                          className={cn(
                            'flex min-h-[54px] flex-col justify-center rounded-xl px-3 py-2 text-left transition-all',
                            style.box,
                            selectable ? 'cursor-pointer active:scale-[0.97]' : 'cursor-not-allowed',
                          )}
                        >
                          <span className="text-sm font-extrabold leading-tight">{fmtTime(slot.start)}</span>
                          <span className={cn('mt-0.5 text-[11px]', style.tone)}>{style.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </main>

      <footer className="sticky bottom-[61px] z-20 border-t border-line bg-surface px-4 py-3.5">
        <p className="mb-2.5 text-center text-xs font-semibold text-muted">
          {selected ? (
            <>
              <span className="font-bold capitalize text-ink">{fmtDayLong(selected.slot.start, lang)}</span> ·{' '}
              <span className="font-bold text-ink">{fmtTime(selected.slot.start)}</span> ·{' '}
              <span className="font-bold text-ink">{resourceName}</span>
            </>
          ) : (
            t('user.availability.selectHint')
          )}
        </p>
        <Button variant="accent" size="lg" disabled={!selected || waitlist.isSuccess} loading={waitlist.isPending} onClick={proceed} className="w-full">
          {view === 'waitlist' ? t('user.confirm.errors.joinWaitlist') : t('user.availability.continue')}
        </Button>
      </footer>
    </div>
  );
}
