// Powered by OnSpace.AI
// Design tokens for the On-Demand Car Wash customer app.
// Metaphor: clean water / glass. Palette: sky blue + cyan.
// Light + dark palettes share the same key shape so any screen can switch
// between them at runtime via contexts/ThemeContext.

export const lightColors = {
  primary: '#0EA5E9',
  primaryDark: '#0369A1',
  primaryLight: '#E0F2FE',
  accent: '#06B6D4',

  background: '#F0F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#E8F2F8',

  text: '#0F2A3D',
  textSubtle: '#5B7688',
  textMuted: '#9AB0BD',
  textOnPrimary: '#FFFFFF',

  border: '#DCE8F0',

  success: '#22C55E',
  successLight: '#DCFCE7',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',

  overlay: 'rgba(15, 42, 61, 0.45)',
} as const;

export const darkColors: typeof lightColors = {
  primary: '#38BDF8',
  primaryDark: '#7DD3FC',
  primaryLight: 'rgba(56, 189, 248, 0.16)',
  accent: '#22D3EE',

  background: '#0B1620',
  surface: '#111E2B',
  surfaceAlt: '#16283A',

  text: '#EAF2F7',
  textSubtle: '#9FB6C6',
  textMuted: '#6C8598',
  textOnPrimary: '#04141F',

  border: '#22384A',

  success: '#4ADE80',
  successLight: 'rgba(74, 222, 128, 0.16)',
  warning: '#FBBF24',
  warningLight: 'rgba(251, 191, 36, 0.16)',
  danger: '#F87171',
  dangerLight: 'rgba(248, 113, 113, 0.16)',

  overlay: 'rgba(3, 10, 16, 0.65)',
};

// Backward-compatible alias — anything importing `colors` statically keeps
// working (it always reflects the light palette; screens that need live
// theming read `colors` from `useTheme()` instead).
export const colors = lightColors;

export const gradients = {
  hero: ['#0EA5E9', '#06B6D4'] as const,
  heroDeep: ['#0369A1', '#0EA5E9'] as const,
  heroDark: ['#075985', '#0E7490'] as const,
  water: ['#38BDF8', '#0EA5E9', '#0284C7'] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const fontSize = {
  caption: 13,
  body: 16,
  bodyLg: 18,
  section: 18,
  title: 22,
  hero: 30,
  display: 38,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const shadow = {
  card: {
    shadowColor: '#0F2A3D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  soft: {
    shadowColor: '#0F2A3D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: '#0369A1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

export const theme = { colors, gradients, spacing, radius, fontSize, fontWeight, shadow };
export type Theme = typeof theme;
