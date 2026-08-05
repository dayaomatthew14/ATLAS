/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Derived, not stock (Phase 1 §1.4). The timetable needs
      // (6 x 140) + 64 = 904px; with a 240px rail and page padding that is
      // 1208px before the grid must scroll, and 1440 is where the labelled
      // rail plus a full grid fit comfortably. `lg` (1024) remains the point
      // below which the rail becomes an off-canvas drawer.
      screens: {
        wide: '1440px',
      },

      colors: {
        // Existing theme-switcher scale. Untouched.
        green: {
          50: 'rgb(var(--color-primary-50) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900) / <alpha-value>)',
          950: 'rgb(var(--color-primary-950) / <alpha-value>)',
        },

        // --- ATLAS design tokens (Phase 1 §1.1) -----------------------------
        // New namespaces only. No existing utility changes meaning, so this
        // config is a no-op visually until screens opt in from Sprint 2.
        // Written as `rgb(var(--x-rgb) / <alpha-value>)` so opacity modifiers
        // actually work. As bare `var(--hex)` entries, `bg-atlas-900/50`
        // produced an invalid colour and silently resolved to transparent —
        // which is how the modal overlay and the mobile nav scrim ended up
        // invisible. The `-rgb` channel triplets live in index.css beside the
        // hex vars, which the print stylesheet still consumes directly.
        atlas: {
          900: 'rgb(var(--atlas-green-900-rgb) / <alpha-value>)',
          800: 'rgb(var(--atlas-green-800-rgb) / <alpha-value>)',
          700: 'rgb(var(--atlas-green-700-rgb) / <alpha-value>)',
          300: 'rgb(var(--atlas-green-300-rgb) / <alpha-value>)',
          100: 'rgb(var(--atlas-green-100-rgb) / <alpha-value>)',
          50: 'rgb(var(--atlas-green-050-rgb) / <alpha-value>)',
          gold: 'rgb(var(--atlas-gold-500-rgb) / <alpha-value>)',
          ink: 'rgb(var(--atlas-ink-rgb) / <alpha-value>)',
          slate: 'rgb(var(--atlas-slate-rgb) / <alpha-value>)',
          disabled: 'rgb(var(--atlas-disabled-rgb) / <alpha-value>)',
          line: 'rgb(var(--atlas-line-rgb) / <alpha-value>)',
          control: 'rgb(var(--atlas-line-input-rgb) / <alpha-value>)',
          surface: 'rgb(var(--atlas-surface-rgb) / <alpha-value>)',
          canvas: 'rgb(var(--atlas-canvas-rgb) / <alpha-value>)',
        },
        sem: {
          conflict: 'rgb(var(--sem-conflict-rgb) / <alpha-value>)',
          'conflict-bg': 'rgb(var(--sem-conflict-bg-rgb) / <alpha-value>)',
          warning: 'rgb(var(--sem-warning-rgb) / <alpha-value>)',
          'warning-bg': 'rgb(var(--sem-warning-bg-rgb) / <alpha-value>)',
          info: 'rgb(var(--sem-info-rgb) / <alpha-value>)',
          'info-bg': 'rgb(var(--sem-info-bg-rgb) / <alpha-value>)',
        },
        dept: {
          cast: 'var(--dept-cast)',
          cbma: 'var(--dept-cbma)',
          cvmas: 'var(--dept-cvmas)',
          coed: 'var(--dept-coed)',
          unregistered: 'var(--dept-unregistered)',
        },
      },

      // Named `display` / `ui` / `data` rather than overriding `sans` and
      // `mono`. Overriding those would restyle every screen the moment this
      // config loads, which Sprint 1 must not do. Fallbacks are metric-
      // adjacent so nothing shifts before the webfonts land in Sprint 2.
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'Cambria', 'serif'],
        ui: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        data: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      // New scale keys. Tailwind's text-sm / text-base etc. are untouched.
      fontSize: {
        micro: ['11px', { lineHeight: '16px', letterSpacing: '0.06em' }],
        caption: ['12px', { lineHeight: '18px' }],
        table: ['13px', { lineHeight: '20px' }],
        body: ['14px', { lineHeight: '22px' }],
        lead: ['16px', { lineHeight: '24px' }],
        section: ['20px', { lineHeight: '28px' }],
        page: ['28px', { lineHeight: '34px' }],
        display: ['36px', { lineHeight: '44px' }],
      },

      borderRadius: {
        control: '9999px',  // buttons — pill
        field: '8px',       // inputs, selects
        panel: '12px',      // cards, tables, modals
        marker: '4px',      // badges, timetable blocks
      },

      boxShadow: {
        overlay: 'var(--shadow-overlay)',
        sticky: 'var(--shadow-sticky)',
      },

      zIndex: {
        sticky: '10',
        railflyout: '20',
        lens: '30',
        contextbar: '40',
        topbar: '50',
        overlay: '100',
        toast: '200',
      },

      spacing: {
        halfhour: 'var(--tt-halfhour)',
        hour: 'var(--tt-hour)',
        daycol: 'var(--tt-daycol-min)',
        gutter: 'var(--tt-gutter)',
        row: 'var(--row-h)',
      },

      transitionDuration: {
        state: 'var(--dur-state)',
        overlay: 'var(--dur-overlay)',
        lens: 'var(--dur-lens)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
      },
    },
  },
  plugins: [],
}

