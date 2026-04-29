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
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          muted: 'var(--accent-muted)',
          fg: 'var(--accent-fg)',
        },
        status: {
          online: 'var(--status-online)',
          danger: 'var(--status-danger)',
          warning: 'var(--status-warning)',
        },
      },
      fontFamily: {
        // Bebas Neue for hero/section heads; Inter for everything else.
        // JetBrains Mono only for code/IDs.
        display: ['Bebas Neue', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        // Slight rounding — sharper than default. Matches tempvoice's
        // crisp card edges.
        sm: '6px',
        DEFAULT: '8px',
        lg: '10px',
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
