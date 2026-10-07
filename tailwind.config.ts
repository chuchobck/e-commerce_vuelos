import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Todos los colores provienen de variables CSS definidas en src/index.css.
 * `colors` se REEMPLAZA (no se extiende) para que sea imposible usar un color
 * fuera de los tokens del sistema de diseño.
 */
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** Espaciado: solo múltiplos de 8 px (más 44 px reservado a objetivos táctiles). */
const spacing: Record<string, string> = {
  0: '0',
  px: '1px',
  2: '0.5rem', // 8
  4: '1rem', // 16
  6: '1.5rem', // 24
  8: '2rem', // 32
  10: '2.5rem', // 40
  11: '2.75rem', // 44 (mínimo táctil WCAG 2.5.8)
  12: '3rem', // 48
  14: '3.5rem', // 56
  16: '4rem', // 64
  20: '5rem', // 80
  24: '6rem', // 96
  32: '8rem', // 128
  40: '10rem', // 160
  48: '12rem', // 192
  64: '16rem', // 256
  80: '20rem', // 320
  96: '24rem', // 384
};

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      background: token('background'),
      surface: token('surface'),
      foreground: token('foreground'),
      muted: token('muted'),
      input: token('input'),
      border: token('border'),
      primary: {
        DEFAULT: token('primary'),
        hover: token('primary-hover'),
        foreground: token('primary-foreground'),
        tint: token('primary-tint'),
      },
      accent: {
        DEFAULT: token('accent'),
        hover: token('accent-hover'),
        foreground: token('accent-foreground'),
      },
      success: {
        DEFAULT: token('success'),
        foreground: token('success-foreground'),
        tint: token('success-tint'),
      },
      error: {
        DEFAULT: token('error'),
        foreground: token('error-foreground'),
        tint: token('error-tint'),
      },
      warning: {
        DEFAULT: token('warning'),
        tint: token('warning-tint'),
      },
      footer: {
        DEFAULT: token('footer'),
        foreground: token('footer-foreground'),
        muted: token('footer-muted'),
        link: token('footer-link'),
        border: token('footer-border'),
      },
      region: {
        costa: token('region-costa'),
        andes: token('region-andes'),
        amazonia: token('region-amazonia'),
        galapagos: token('region-galapagos'),
      },
      focus: token('focus'),
      overlay: token('overlay'),
    },
    spacing,
    borderRadius: {
      none: '0',
      sm: '4px', // solo controles diminutos (casilla de verificación)
      DEFAULT: 'var(--radius)',
      md: 'var(--radius)',
      lg: 'var(--radius)',
      full: '9999px',
    },
    fontFamily: {
      /** Interfaz y textos: moderna, abierta y muy legible. */
      sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      /** Títulos grandes (h1, h2): carácter editorial, de revista de viajes. */
      display: ['Fraunces', 'Georgia', 'serif'],
    },
    /** Nunca menos de 16 px. Base 18 px. Interlineado 1.5. */
    fontSize: {
      sm: ['1rem', { lineHeight: '1.5' }], // 16
      base: ['1.125rem', { lineHeight: '1.5' }], // 18
      lg: ['1.25rem', { lineHeight: '1.5' }], // 20
      xl: ['1.5rem', { lineHeight: '1.4' }], // 24
      '2xl': ['1.75rem', { lineHeight: '1.3' }], // 28
      '3xl': ['2.25rem', { lineHeight: '1.25' }], // 36
      '4xl': ['3rem', { lineHeight: '1.2' }], // 48
    },
    extend: {
      maxWidth: {
        content: '80rem', // 1280
        prose: '45rem',
      },
      minHeight: {
        touch: '2.75rem',
      },
      minWidth: {
        touch: '2.75rem',
      },
      ringWidth: {
        focus: '3px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--color-shadow) / 0.08), 0 8px 24px rgb(var(--color-shadow) / 0.08)',
        raised: '0 16px 48px rgb(var(--color-shadow) / 0.16)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 240ms ease-out',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
