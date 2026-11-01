// Same tokens as apps/web/tailwind.config.ts: warm off-white, one deep green, one warm food accent.
export const theme = {
  colors: {
    bg: '#FAF7F2',
    surface: '#FFFFFF',
    text: '#1C2421',
    soft: '#4B5550',
    // #7A837E was 3.66:1 on bg (fails AA); same fix as the web's ink-muted.
    muted: '#646D68',
    border: '#E7E1D8',
    brand: '#1F5C46',
    brandDark: '#164434',
    brandSoft: '#E4EFE9',
    food: '#E08A2E',
    // Amber for text: 5.64:1 on foodSoft. `food` itself is for fills and graphics only.
    foodInk: '#8F4F0C',
    foodSoft: '#FCEFDF',
    danger: '#B4382F',
    dangerSoft: '#FBE9E7',
    white: '#FFFFFF',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 14, lg: 20, pill: 999 },
} as const;
