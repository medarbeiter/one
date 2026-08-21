'use client';

import {
  ArrowClockwise, Calendar, CaretLeft, CaretLineLeft, CaretLineRight,
  CaretRight, ChatCircleText, ChartLine, Check, Copy, DotsThree, EnvelopeSimple, Eye, FacebookLogo, Funnel, Gear, GridNine,
  House, ImageSquare, InstagramLogo, Link as LinkIcon, MagnifyingGlass, MapPin, Megaphone,
  PaperPlaneTilt, Pause, PencilSimple, Play, Plus, Rocket, SignOut, Sun, Trash, Tray,
  UploadSimple, User, Users, UsersThree, VideoCamera, Warning, X,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';

/**
 * One module names every meaning this application has. Components ask for a
 * MEANING and never for a glyph, so "edit" cannot become three different
 * pencils across the campaign list, the wizard and the customer sheet.
 *
 * Adding an icon means adding a meaning — and the author finds out on the way
 * in whether that meaning already has one.
 *
 * The form axis carries selection: `solid` means running / chosen / selected,
 * `outline` means the opposite. Phosphor has a full weight axis and complete
 * outline/fill pairs, so unlike Typicons the channel never silently degrades.
 *
 * `outline` renders at `bold`, not `regular` — same choice and reasoning as
 * the hub's `umriss` (see components/sinnbilder.tsx there): at 16px next to
 * 13–14px text, `regular`'s stroke reads as too thin to carry weight, which
 * is exactly why unported icons here looked gray next to the hub's.
 */
export const MEANINGS = {
  add: { solid: Plus, outline: Plus },
  edit: { solid: PencilSimple, outline: PencilSimple },
  remove: { solid: Trash, outline: Trash },
  close: { solid: X, outline: X },
  confirm: { solid: Check, outline: Check },
  search: { solid: MagnifyingGlass, outline: MagnifyingGlass },
  retry: { solid: ArrowClockwise, outline: ArrowClockwise },
  copy: { solid: Copy, outline: Copy },
  settings: { solid: Gear, outline: Gear },
  signOut: { solid: SignOut, outline: SignOut },

  campaign: { solid: Megaphone, outline: Megaphone },
  launch: { solid: Rocket, outline: Rocket },
  preview: { solid: Eye, outline: Eye },
  location: { solid: MapPin, outline: MapPin },
  leadForm: { solid: LinkIcon, outline: LinkIcon },

  image: { solid: ImageSquare, outline: ImageSquare },
  video: { solid: VideoCamera, outline: VideoCamera },
  upload: { solid: UploadSimple, outline: UploadSimple },

  customer: { solid: User, outline: User },
  audience: { solid: Users, outline: Users },

  active: { solid: Play, outline: Play },
  paused: { solid: Pause, outline: Pause },
  warning: { solid: Warning, outline: Warning },

  previous: { solid: CaretLeft, outline: CaretLeft },
  next: { solid: CaretRight, outline: CaretRight },

  moreActions: { solid: DotsThree, outline: DotsThree },

  today: { solid: House, outline: House },
  inbox: { solid: Tray, outline: Tray },
  customers: { solid: UsersThree, outline: UsersThree },
  filter: { solid: Funnel, outline: Funnel },

  comment: { solid: ChatCircleText, outline: ChatCircleText },
  dm: { solid: EnvelopeSimple, outline: EnvelopeSimple },
  facebook: { solid: FacebookLogo, outline: FacebookLogo },
  instagram: { solid: InstagramLogo, outline: InstagramLogo },
  send: { solid: PaperPlaneTilt, outline: PaperPlaneTilt },
  /* A caret against a line, not the bare caret `previous`/`next` use — the
     rail toggle and pagination are different actions and shouldn't render
     as the same glyph (see the vocabulary test below). Hub's `einklappen`/
     `ausklappen` do reuse `zurueck`/`weiter`'s bare caret deliberately; this
     module holds itself to the stricter rule instead of copying that one
     exception. */
  collapse: { solid: CaretLineLeft, outline: CaretLineLeft },
  expand: { solid: CaretLineRight, outline: CaretLineRight },

  /* Die vier Zeiträume der Kampagnenansicht — die Reiter des Navigators
     (app/shell/navigator.tsx). Sie ersetzen das frühere `calendar`, das ein
     Glyphenname war und keine Bedeutung: „Kalender" sagt nicht, welcher
     Ausschnitt gemeint ist, und genau das ist hier die Frage. Wie im Hub
     (`tag`/`woche`/`monat`/`konto` in components/sinnbilder.tsx) trägt der
     offene Zeitraum sein Zeichen gefüllt.

     Es sind Zeichen für Zeichen dieselben vier wie dort — auch das Raster für
     die Woche. Zwei Kalenderblätter nebeneinander (`CalendarDots` neben
     `CalendarBlank`) unterscheiden sich bei 14px um drei Punkte und lesen sich
     als dasselbe Zeichen; das Raster steht dagegen für die Menge der Tage, die
     man auf einmal sieht, und hat gegen das Blatt echte Masse. */
  periodDay: { solid: Sun, outline: Sun },
  periodWeek: { solid: GridNine, outline: GridNine },
  periodMonth: { solid: Calendar, outline: Calendar },
  periodTotal: { solid: ChartLine, outline: ChartLine },
} satisfies Record<string, { solid: PhosphorIcon; outline: PhosphorIcon }>;

export type Meaning = keyof typeof MEANINGS;

/**
 * Icons never speak alone. Every glyph sits beside its label and is therefore
 * always aria-hidden — nothing in this UI is stated by an icon only.
 *
 * Colour is inherited by default, so a sign inside a gold primary button takes
 * the button's dark ink automatically and the Dark-Ink-On-Gold rule holds
 * without being restated at the call site.
 */
export function Sign({
  meaning,
  form = 'solid',
  size = 16,
  color,
  className,
}: {
  meaning: Meaning;
  form?: 'solid' | 'outline';
  size?: number;
  /** Overrides the inherited ink — e.g. `var(--color-icon-secondary)` for a muted sign. */
  color?: string;
  className?: string;
}): ReactNode {
  const Glyph = MEANINGS[meaning][form];
  return (
    <Glyph
      aria-hidden
      focusable={false}
      size={size}
      weight={form === 'solid' ? 'fill' : 'bold'}
      className={className}
      style={{ flexShrink: 0, color }}
    />
  );
}
