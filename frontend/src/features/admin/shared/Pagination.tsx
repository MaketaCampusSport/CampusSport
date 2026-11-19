import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PageMeta } from '@/api/client';
import { Button } from '@/components/ui/Button';

/** Subsolul unui tabel paginat (`PageMeta` din contract). */
export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(meta.total / meta.page_size));
  return (
    <div className="flex items-center justify-between border-t border-line px-6 py-3">
      <p className="text-sm text-muted" aria-live="polite">
        {t('common.pageInfo', { page: meta.page, pages, total: meta.total })}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={meta.page <= 1} aria-label={t('common.prevPage')} onClick={() => onPage(meta.page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="outline" size="sm" disabled={meta.page >= pages} aria-label={t('common.nextPage')} onClick={() => onPage(meta.page + 1)}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
