import type { Config } from 'tailwindcss';
import { colors, fonts, motion, radius, shadows, zIndex } from './lib/tokens';

// Built from lib/tokens.ts (same brand as apps/mobile/lib/theme.ts): warm off-white, one deep green, one warm food accent.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      fontFamily: { sans: fonts.sans, display: fonts.display },
      borderRadius: radius,
      boxShadow: shadows,
      zIndex,
      maxWidth: { content: '72rem', prose: '42rem' },
      transitionDuration: { feedback: `${motion.feedback}ms`, panel: `${motion.panel}ms`, section: `${motion.section}ms` },
      transitionTimingFunction: { out: `cubic-bezier(${motion.easeOut.join(',')})`, in: `cubic-bezier(${motion.easeIn.join(',')})` },
    },
  },
  plugins: [],
} satisfies Config;
