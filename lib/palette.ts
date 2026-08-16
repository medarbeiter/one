/**
 * The house palette, as data. `theme/house.ts` builds the Astryx theme from
 * these values and `lib/contrast.test.ts` asserts against them, so a colour
 * cannot be changed in one place and quietly survive in the other.
 *
 * Values are shared verbatim with MedArbeiter Hub. When Phase 2 extracts
 * @medarbeiter/design, this file becomes the package's source of truth.
 */
export const PALETTE = {
  // Gold, saturated — the primary action. Carries meaning, so it never
  // identifies anything by its fill alone (see goldIcon).
  gold: '#e1b025',
  // The only ink allowed on a gold surface. White on gold fails AA.
  onGold: '#231a02',
  // Gold demoted to text grade: 6.0:1 on white.
  bronzeText: '#7c5f05',
  // Gold as an icon or a hairline: clears 3:1 on every ground the house uses.
  goldIcon: '#8f6e06',
  // Gold as brand presence. Says nothing, so no contrast floor applies.
  goldWash: '#f7edd2',

  // Warm neutrals. Never a cold gray ladder.
  ink: '#1c1917',
  stone: '#67625a',
  stoneDisabled: '#a8a29e',
  paper: '#faf8f3',
  white: '#ffffff',
  parchment: '#f5f2ea',
  borderEmphasized: '#d8d2c6',

  // Status. Never gold — a status that wore gold would impersonate the brand.
  warningFill: '#dd7200',
  warningText: '#6e3500',
  errorFill: '#e33f4a',
  errorText: '#a50c25',
  successFill: '#198100',
  infoFill: '#0074e2',
} as const;

export type PaletteKey = keyof typeof PALETTE;
