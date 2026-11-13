/**
 * Design tokens: the single source for colours, type, radius, shadows, z-index and motion.
 * tailwind.config.ts builds utility classes from this file; non-Tailwind code (map pins, the 3D scene)
 * imports it directly. Contrast ratios are measured in docs/design/system.md.
 */
export const colors = {
  bg: '#FAF7F2', // warm off-white page
  surface: '#FFFFFF',
  raised: '#FFFDF9', // popovers, sticky bars
  ink: { DEFAULT: '#1C2421', soft: '#4B5550', muted: '#646D68' }, // muted was #7A837E (3.7:1, failed AA)
  line: '#E7E1D8', // decorative dividers
  control: '#8C857A', // input and checkbox boundaries (3.4:1 on bg, 3.7:1 on white)
  brand: { DEFAULT: '#1F5C46', dark: '#164434', soft: '#E4EFE9', on: '#FFFFFF' },
  // Amber is for food and highlights. As text it must be food-ink; plain `food` is for fills under dark text.
  food: { DEFAULT: '#E08A2E', soft: '#FCEFDF', ink: '#8F4F0C', star: '#B86A12' }, // star: rating glyphs, 4.1:1 on white
  ok: { DEFAULT: '#1E6B43', soft: '#E3F1E8' },
  warn: { DEFAULT: '#8F4F0C', soft: '#FCEFDF' },
  danger: { DEFAULT: '#B4382F', soft: '#FBE9E7' },
  info: { DEFAULT: '#1F5A80', soft: '#E5EFF6' },
  ring: '#1F5C46',
} as const;

export const fonts = {
  sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
  display: ['"Fraunces Variable"', 'Georgia', 'ui-serif', 'serif'],
};

export const radius = { sm: '8px', md: '12px', lg: '16px', xl: '14px', '2xl': '20px' };

export const shadows = {
  card: '0 1px 2px rgba(28,36,33,0.06), 0 4px 16px rgba(28,36,33,0.06)',
  raised: '0 2px 4px rgba(28,36,33,0.06), 0 12px 32px rgba(28,36,33,0.10)',
  overlay: '0 24px 64px rgba(28,36,33,0.22)',
};

export const zIndex = { base: '0', sticky: '30', header: '40', drawer: '50', toast: '60', modal: '70' };

/** Motion durations (ms) and easings shared by CSS and the motion package. Exits run at ~65% of enter time. */
export const motion = {
  feedback: 150,
  panel: 220,
  section: 380,
  easeOut: [0.16, 1, 0.3, 1] as const,
  easeIn: [0.7, 0, 0.84, 0] as const,
};
