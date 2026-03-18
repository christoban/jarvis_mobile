/**
 * theme/index.ts — Design System Jarvis
 * Aesthetic : dark military terminal — cyan glow sur fond noir profond
 */

export const Colors = {
  // Fonds
  bg:           '#09090F',
  bgCard:       '#0E0E18',
  bgElevated:   '#13131E',
  bgInput:      '#0B0B14',
  // Accents
  primary:      '#00E5FF',
  primaryBg:    'rgba(0,229,255,0.08)',
  primaryGlow:  'rgba(0,229,255,0.25)',
  success:      '#00E676',
  successBg:    'rgba(0,230,118,0.07)',
  error:        '#FF1744',
  errorBg:      'rgba(255,23,68,0.07)',
  amber:        '#FFB300',
  amberBg:      'rgba(255,179,0,0.07)',
  // Texte
  textPrimary:   '#EAEAF4',
  textSecondary: '#6A6A84',
  textMuted:     '#3C3C52',
  textAccent:    '#00E5FF',
  // Bordures
  border:        '#1A1A2A',
  borderAccent:  'rgba(0,229,255,0.35)',
  divider:       '#141420',
} as const;

export const Spacing = { xs:4, sm:8, md:16, lg:24, xl:32, xxl:56 } as const;

export const Radius = { sm:4, md:8, lg:14, xl:22, full:999 } as const;

export const Shadow = {
  cyan: { shadowColor:'#00E5FF', shadowOffset:{width:0,height:0}, shadowOpacity:0.45, shadowRadius:14, elevation:10 },
  card: { shadowColor:'#000',    shadowOffset:{width:0,height:4},  shadowOpacity:0.55, shadowRadius:10, elevation:6  },
} as const;

// Alias legacy pour api.service (garde la compatibilité)
export const colors = {
  bg: Colors.bg, bgCard: Colors.bgCard, bgElevated: Colors.bgElevated,
  bgInput: Colors.bgInput, cyan: Colors.primary, cyanDim: '#00B8CC',
  cyanGlow: Colors.primaryGlow, amber: Colors.amber, green: Colors.success,
  red: Colors.error, textPrimary: Colors.textPrimary,
  textSecondary: Colors.textSecondary, textMuted: Colors.textMuted,
  border: Colors.border, borderActive: Colors.primary,
} as const;
export const spacing = Spacing;
export const radius  = Radius;
export const shadow  = Shadow;
