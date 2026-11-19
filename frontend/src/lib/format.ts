import i18n from '@/i18n';

function lng(): string {
  return i18n.language?.startsWith('en') ? 'en-GB' : 'ro-RO';
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(lng(), options).format(value);
}

/** 68 → „68%”, 4.1 → „4,1%” (zecimale doar când sunt necesare). */
export function formatPercent(value: number, fractionDigits = 0): string {
  return `${formatNumber(value, { minimumFractionDigits: 0, maximumFractionDigits: fractionDigits })}%`;
}

/** Diferență semnată: +6 → „+6%”, -1.2 → „−1,2%”. */
export function formatDelta(value: number, fractionDigits = 0): string {
  const abs = formatNumber(Math.abs(value), {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return `${abs}%`;
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}
