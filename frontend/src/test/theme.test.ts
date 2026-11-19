import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, useUiStore } from '@/stores/uiStore';

describe('Tema (UI-07)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useUiStore.setState({ theme: 'system' });
  });

  it('aplică tema întunecată și o păstrează', () => {
    useUiStore.getState().setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('cs-theme')).toBe('dark');
  });

  it('aplică tema luminoasă', () => {
    useUiStore.getState().setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('„system” urmează preferința sistemului (matchMedia din setup.ts: luminos)', () => {
    applyTheme('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});