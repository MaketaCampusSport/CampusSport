import { useTranslation } from 'react-i18next';

export function Logo() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-xl font-extrabold text-sun"
      >
        C
      </span>
      <div className="leading-tight">
        <p className="heading text-lg !text-white">CampusSport</p>
        <p className="text-[13px] text-slate-400">{t('nav.adminLabel')}</p>
      </div>
    </div>
  );
}
