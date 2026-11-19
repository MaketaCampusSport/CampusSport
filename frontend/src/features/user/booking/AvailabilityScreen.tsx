import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { enUS, ro } from 'date-fns/locale';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import {
  toSlotItem,
  type SelectedSlotSummary,
  type SlotStatus,
  type TimeSlotItem,
} from './mapAvailability';
import { useAvailability, useSports } from './useAvailability';

interface AvailabilityScreenProps {
  sportId: string;
  onBack: () => void;
  onContinue?: (selection: SelectedSlotSummary) => void;
}

export default function AvailabilityScreen({
  sportId,
  onBack,
  onContinue,
}: AvailabilityScreenProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('en') ? enUS : ro;
  const langKey = i18n.language.startsWith('en') ? 'en' : 'ro';

  // 1. Generăm cele 7 zile începând de azi cu date-fns
  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(today, offset);
      return {
        id: format(date, 'yyyy-MM-dd'),
        dayShort: format(date, 'EEE', { locale: dateLocale }).replace('.', '').toUpperCase(),
        dayNumber: format(date, 'd'),
        fullLabel: format(date, 'EEEE, d MMM', { locale: dateLocale }),
      };
    });
  }, [dateLocale]);

  const [selectedDayId, setSelectedDayId] = useState<string>(() => days[0].id);
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [expandedResources, setExpandedResources] = useState<Record<string, boolean>>({});

  // 4 & 7. Date din API via TanStack Query
  const { data: sports } = useSports();
  const { data, isLoading, isError, refetch } = useAvailability(sportId, selectedDayId);

  const sportName = useMemo(() => {
    const found = sports?.find((s) => s.id === sportId);
    if (!found) return sportId;
    return typeof found.name === 'string' ? found.name : found.name[langKey] ?? found.name.ro;
  }, [sports, sportId, langKey]);

  const resources = useMemo(() => {
    return (data?.resources ?? []).map((res) => ({
      id: res.resource_id,
      name: res.resource_name,
      // Punctul 8: type dacă există în răspuns, altfel numele sportului
      typeLabel: (res as { type?: string }).type ?? sportName,
      slots: res.slots.map((slot) => toSlotItem(res.resource_id, slot)),
    }));
  }, [data, sportName]);

  const activeDay = useMemo(
    () => days.find((d) => d.id === selectedDayId) ?? days[0],
    [days, selectedDayId],
  );

  const selectedSummary = useMemo<SelectedSlotSummary | null>(() => {
    if (!selectedSlotKey) return null;

    for (const resource of resources) {
      const found = resource.slots.find(
        (slot) => `${resource.id}::${slot.id}` === selectedSlotKey,
      );
      if (found && found.status === 'free') {
        return {
          sportId,
          sportName,
          resourceId: resource.id,
          resourceName: resource.name,
          location: resource.typeLabel,
          dayId: activeDay.id,
          dayLabel: activeDay.fullLabel,
          slotId: found.id,
          time: found.time,
          endTime: found.endTime,
        };
      }
    }
    return null;
  }, [selectedSlotKey, resources, sportId, sportName, activeDay]);

  const handleDayChange = (dayId: string) => {
    setSelectedDayId(dayId);
    setSelectedSlotKey(null);
  };

  const handleToggleExpand = (resourceId: string) => {
    setExpandedResources((prev) => ({
      ...prev,
      [resourceId]: !prev[resourceId],
    }));
  };

  const getSlotStyles = (status: SlotStatus, isSelected: boolean) => {
    if (isSelected) {
      return {
        container: 'bg-sun border-2 border-ink text-onsun shadow-card',
        label: t('user.availability.slot.selected'),
        labelClass: 'text-onsun font-bold',
        disabled: false,
      };
    }

    switch (status) {
      case 'free':
        return {
          container: 'bg-surface border border-line hover:border-brand text-ink',
          label: t('user.availability.slot.free'),
          labelClass: 'text-muted font-medium',
          disabled: false,
        };
      case 'my_booking':
        return {
          container: 'bg-brand border border-brand text-white',
          label: t('user.availability.slot.myBooking'),
          labelClass: 'text-white/90 font-semibold',
          disabled: true,
        };
      case 'pe_class':
        return {
          container: 'bg-warn-soft border border-warn-ink/20 text-warn-ink',
          label: t('user.availability.slot.peClass'),
          labelClass: 'text-warn-ink font-semibold',
          disabled: true,
        };
      case 'occupied':
      default:
        return {
          container: 'bg-subtle border border-transparent text-muted/60',
          label: t('user.availability.slot.occupied'),
          labelClass: 'text-muted/60 font-medium',
          disabled: true,
        };
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between border-x border-line bg-subtle shadow-card">
      {/* Top Header & Day Strip */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('user.availability.backAria')}
            className="-ml-2 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-ink transition-colors hover:bg-subtle"
          >
            <ChevronLeft size={22} strokeWidth={2.5} />
          </button>

          <span className="text-[11px] font-bold uppercase tracking-widest text-brand-text">
            {t('user.availability.stepTitle')}
          </span>

          <span className="text-xs font-bold text-muted">CampusSport</span>
        </div>

        {/* Punctul 8: Filtrul Interior/Exterior este ascuns până la decizia backend-ului */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="heading text-3xl uppercase tracking-wide text-ink">
            {sportName}
          </h1>
        </div>

        {/* Horizontal Scrollable 7-Day Selector Strip */}
        <div
          className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pt-3 pb-1"
          role="tablist"
          aria-label={t('user.availability.selectDayAria')}
        >
          {days.map((day) => {
            const isSelected = day.id === selectedDayId;
            return (
              <button
                key={day.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleDayChange(day.id)}
                className={cn(
                  'flex min-h-[60px] min-w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl px-2.5 py-2 transition-all',
                  isSelected
                    ? 'bg-brand text-white shadow-card'
                    : 'bg-subtle text-ink hover:bg-line/60',
                )}
              >
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider',
                    isSelected ? 'text-white/90' : 'text-muted',
                  )}
                >
                  {day.dayShort}
                </span>
                <span className="heading mt-0.5 text-xl leading-tight">
                  {day.dayNumber}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">
            {t('user.availability.chooseCourtAndTime')}
          </h2>
          {!isLoading && !isError && (
            <span className="text-xs font-semibold text-muted">
              {t('user.availability.courtCount', { count: resources.length })}
            </span>
          )}
        </div>

        {/* Punctul 6: Stare de încărcare (schelet pentru carduri) */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <Card key={n} className="space-y-3 border border-line/60 p-4">
                <Skeleton className="h-5 w-40 rounded-lg" />
                <Skeleton className="h-3.5 w-24 rounded-lg" />
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Skeleton className="h-[54px] rounded-xl" />
                  <Skeleton className="h-[54px] rounded-xl" />
                  <Skeleton className="h-[54px] rounded-xl" />
                </div>
              </Card>
            ))}
          </div>
        ) : isError ? (
          /* Punctul 6: Stare de eroare cu buton Reîncearcă */
          <Card className="border border-line/60">
            <ErrorState onRetry={() => void refetch()} className="py-10" />
          </Card>
        ) : resources.length === 0 ? (
          <Card className="border border-line/60 p-6 text-center">
            <p className="text-sm font-bold text-ink">
              {t('user.availability.emptyTitle')}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t('user.availability.emptyBody', { sport: sportName })}
            </p>
          </Card>
        ) : (
          resources.map((resource) => {
            const isExpanded = Boolean(expandedResources[resource.id]);
            const visibleSlots: TimeSlotItem[] = isExpanded
              ? resource.slots
              : resource.slots.slice(0, 6);

            return (
              <Card
                key={resource.id}
                aria-label={resource.name}
                className="border border-line/60 p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold leading-tight text-ink">
                      {resource.name}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium capitalize text-muted">
                      {resource.typeLabel}
                    </p>
                  </div>

                  {resource.slots.length > 6 && (
                    <button
                      type="button"
                      onClick={() => handleToggleExpand(resource.id)}
                      className="min-h-[36px] shrink-0 px-1 text-xs font-bold text-brand-text hover:underline"
                    >
                      {isExpanded
                        ? t('user.availability.showLess')
                        : t('user.availability.showMore')}
                    </button>
                  )}
                </div>

                {/* Horizontal Scrollable 2-Row Slot Grid */}
                <div
                  className="grid grid-flow-col grid-rows-2 auto-cols-[minmax(108px,1fr)] gap-2 overflow-x-auto pb-1"
                  role="group"
                  aria-label={t('user.availability.slotsAria', { name: resource.name })}
                >
                  {visibleSlots.map((slot) => {
                    const compositeKey = `${resource.id}::${slot.id}`;
                    const isSelected = selectedSlotKey === compositeKey;
                    const styles = getSlotStyles(slot.status, isSelected);

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={styles.disabled}
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSelectedSlotKey((prev) =>
                            prev === compositeKey ? null : compositeKey,
                          )
                        }
                        className={cn(
                          'flex min-h-[54px] flex-col justify-center rounded-xl px-3 py-2 text-left transition-all',
                          styles.container,
                          styles.disabled
                            ? 'cursor-not-allowed'
                            : 'cursor-pointer active:scale-[0.97]',
                        )}
                      >
                        <span className="text-sm font-extrabold leading-tight">
                          {slot.time}
                        </span>
                        <span className={cn('mt-0.5 text-[11px]', styles.labelClass)}>
                          {styles.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })
        )}
      </main>

      {/* Sticky Bottom Summary & Primary CTA (Button variant="accent" size="lg") */}
      <footer className="shrink-0 border-t border-line bg-surface px-4 py-3.5">
        <p className="mb-2.5 text-center text-xs font-semibold text-muted">
          {selectedSummary ? (
            <>
              <span className="font-bold text-ink capitalize">
                {selectedSummary.dayLabel}
              </span>{' '}
              · <span className="font-bold text-ink">{selectedSummary.time}</span> ·{' '}
              <span className="font-bold text-ink">{selectedSummary.resourceName}</span>
            </>
          ) : (
            t('user.availability.selectHint')
          )}
        </p>

        <Button
          variant="accent"
          size="lg"
          disabled={!selectedSummary}
          onClick={() => selectedSummary && onContinue?.(selectedSummary)}
          className="w-full"
        >
          {t('user.availability.continue')}
        </Button>
      </footer>
    </div>
  );
}