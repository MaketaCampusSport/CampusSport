import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('adaugă BOM UTF-8 și linii CRLF', () => {
    const out = toCsv([['a', 'b'], [1, 2]]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toBe('﻿a,b\r\n1,2\r\n');
  });
  it('escapează ghilimele, virgule și rânduri noi', () => {
    expect(toCsv([['a,b', 'ea "x"', 'l1\nl2']])).toBe('﻿"a,b","ea ""x""","l1\nl2"\r\n');
  });
  it('tratează null/undefined ca celulă goală și păstrează diacriticele', () => {
    expect(toCsv([[null, undefined, 'Țară']])).toBe('﻿,,Țară\r\n');
  });
});
