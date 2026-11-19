import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import ro from './ro.json';

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}
const strip = (k: string) => k.replace(/_(one|few|many|other|zero|two)$/, '');
const roKeys = new Set(flatten(ro).map(strip));
const enKeys = new Set(flatten(en).map(strip));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(tsx?)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe('i18n', () => {
  it('RO și EN au exact aceleași chei', () => {
    expect([...roKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !roKeys.has(k))).toEqual([]);
  });

  it('fiecare cheie statică folosită în cod există în traduceri', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z]+(?:\.[a-zA-Z0-9_]+)+)'/g)) used.add(m[1] as string);
      for (const m of text.matchAll(/(?:labelKey|titleKey):\s*'([a-zA-Z.]+)'/g)) used.add(m[1] as string);
      // t(cond ? 'a.b' : 'c.d') și t(needsCode ? 'x' : 'y')
      for (const m of text.matchAll(/\bt\([^)]*?\?\s*'([a-zA-Z.]+)'\s*:\s*'([a-zA-Z.]+)'/g)) { used.add(m[1] as string); used.add(m[2] as string); }
    }
    const missing = [...used].filter((k) => !roKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('cheile cu pluralizare au formele românești one/few/other', () => {
    const keys = flatten(ro).filter((k) => k.endsWith('_few'));
    expect(keys.length).toBeGreaterThan(5);
    for (const k of keys) {
      const base = k.replace(/_few$/, '');
      expect(flatten(ro)).toEqual(expect.arrayContaining([`${base}_one`, `${base}_other`]));
    }
  });
});
