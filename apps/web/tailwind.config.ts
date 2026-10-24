import type { Config } from 'tailwindcss';

// Same tokens as apps/mobile/lib/theme.ts: warm off-white, one deep green, one warm food accent.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAF7F2',
        surface: '#FFFFFF',
        ink: { DEFAULT: '#1C2421', soft: '#4B5550', muted: '#7A837E' },
        line: '#E7E1D8',
        brand: { DEFAULT: '#1F5C46', dark: '#164434', soft: '#E4EFE9' },
        food: { DEFAULT: '#E08A2E', soft: '#FCEFDF' },
        danger: { DEFAULT: '#B4382F', soft: '#FBE9E7' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
      boxShadow: { card: '0 1px 2px rgba(28,36,33,0.06), 0 4px 16px rgba(28,36,33,0.06)' },
    },
  },
  plugins: [],
} satisfies Config;
