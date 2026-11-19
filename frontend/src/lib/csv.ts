export type CsvCell = string | number | boolean | null | undefined;

function escapeCell(value: CsvCell): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Construiește un fișier CSV (UTF-8 cu BOM, ca Excel să afișeze corect diacriticele).
 * Folosit pentru șablonul de import al orarului EF și pentru exporturile din modul demo.
 */
export function toCsv(rows: CsvCell[][], delimiter = ','): string {
  const body = rows.map((r) => r.map(escapeCell).join(delimiter)).join('\r\n');
  return `﻿${body}\r\n`;
}
