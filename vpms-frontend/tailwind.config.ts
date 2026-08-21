import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // hsl(var(--x) / <alpha-value>) — not plain hsl(var(--x)) — is required for
        // Tailwind's opacity modifiers (bg-primary/80, etc.) to work against a CSS
        // custom property instead of silently no-oping.
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          hover: 'hsl(var(--primary-hover) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          hover: 'hsl(var(--destructive-hover) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
          bg: 'hsl(var(--danger-bg) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          bg: 'hsl(var(--success-bg) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          bg: 'hsl(var(--warning-bg) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        // JHS brand crimson — deliberately separate from the structural `accent` token
        // above (which drives neutral hover-state backgrounds across shadcn
        // components). Use `brand` for actual brand-accent moments: active nav
        // indicator, focus highlights, deliberate crimson callouts.
        brand: {
          DEFAULT: 'hsl(var(--brand-accent) / <alpha-value>)',
          foreground: 'hsl(var(--brand-accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
      },
      fontFamily: {
        heading: ['Manrope', '-apple-system', 'Segoe UI', 'Arial', 'sans-serif'],
        body: ['Inter', '-apple-system', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      fontSize: {
        // Named after tokens.css's --text-size-N scale, same pixel values.
        'size-1': '28px',
        'size-2': '20px',
        'size-3': '16px',
        'size-4': '14px',
        'size-5': '12px',
      },
      spacing: {
        // tokens.css's --space-N scale, same pixel values, additive to Tailwind's default scale.
        'space-1': '8px',
        'space-2': '16px',
        'space-3': '24px',
        'space-4': '32px',
        'space-5': '48px',
        sidebar: 'var(--sidebar-width)',
        topbar: 'var(--topbar-height)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: '8px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config
