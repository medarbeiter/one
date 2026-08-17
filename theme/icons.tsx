'use client';

import {
  ArrowClockwise, CaretLeft, CaretRight, Check, Copy, Eye, Gear, ImageSquare,
  Link as LinkIcon, MagnifyingGlass, MapPin, Megaphone, Pause, PencilSimple,
  Play, Plus, Rocket, SignOut, Trash, UploadSimple, User, Users, VideoCamera,
  Warning, X, type Icon as PhosphorIcon,
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
}: {
  meaning: Meaning;
  form?: 'solid' | 'outline';
  size?: number;
}): ReactNode {
  const Glyph = MEANINGS[meaning][form];
  return <Glyph aria-hidden size={size} weight={form === 'solid' ? 'fill' : 'regular'} />;
}
