import type { Config } from 'tailwindcss';

// All visible colors come from CSS custom properties so themes can swap
// at runtime without rebuilding. The HSL channel-style values let us
// use Tailwind's `bg-accent/40` opacity modifiers.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          card: 'var(--bg-card)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
          input: 'var(--bg-input)',
          float: 'var(--bg-float)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          press: 'var(--accent-press)',
          text: 'var(--accent-text)',
          muted: 'var(--accent-muted)',
          tint: 'var(--accent-tint)',
          fg: 'var(--accent-fg)',
        },
        status: {
          online: 'var(--status-online)',
          danger: 'var(--status-danger)',
          warning: 'var(--status-warning)',
        },
      },
      fontFamily: {
        // echoed.gg's faces: Unbounded for display (page titles, hero),
        // Geologica for everything else. JetBrains Mono for commands/IDs.
        display: ['Unbounded', 'Geologica', 'Segoe UI', 'sans-serif'],
        sans: ['Geologica', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        // echoed.gg's radii: controls 8, fields 10, plates 16.
        sm: '6px',
        DEFAULT: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
      },
      transitionTimingFunction: {
        // 100-150ms transitions per the Echoed design language.
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
