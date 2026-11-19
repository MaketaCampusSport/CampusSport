import type { Config } from 'tailwindcss';

const rgb = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: rgb('--c-canvas'), surface: rgb('--c-surface'), subtle: rgb('--c-subtle'),
        line: rgb('--c-line'), ink: rgb('--c-ink'), muted: rgb('--c-muted'),
        navy: { DEFAULT: rgb('--c-navy'), 2: rgb('--c-navy-2') },
        onsun: '#0E1726',
        brand: { DEFAULT: rgb('--c-brand'), hover: rgb('--c-brand-hover'), soft: rgb('--c-brand-soft'), text: rgb('--c-brand-text'), tint: rgb('--c-brand-tint') },
        sun: { DEFAULT: rgb('--c-sun'), hover: rgb('--c-sun-hover') },
        danger: { DEFAULT: rgb('--c-danger'), strong: rgb('--c-danger-strong'), soft: rgb('--c-danger-soft'), ink: rgb('--c-danger-ink') },
        success: { DEFAULT: rgb('--c-success'), soft: rgb('--c-success-soft'), ink: rgb('--c-success-ink') },
        warn: { soft: rgb('--c-warn-soft'), ink: rgb('--c-warn-ink') },
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Barlow Condensed', 'Barlow', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        // `shadow-xs` și `backdrop-blur-xs` există doar în Tailwind 4; le definim pentru 3.4
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        card: '0 1px 2px rgb(14 23 38 / 0.04), 0 8px 24px -12px rgb(14 23 38 / 0.10)',
        pop: '0 24px 64px -16px rgb(14 23 38 / 0.35)',
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
} satisfies Config;