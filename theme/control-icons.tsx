'use client';

/**
 * @file control-icons.tsx
 * @input Uses @phosphor-icons/react (SSR entry), IconRegistry type
 * @output Exports houseIconRegistry for the house theme
 * @position Icon configuration for the theme; consumed by theme/house.ts
 *
 * Astryx's own built-in glyphs — the checkmarks in checkboxes, the chevrons
 * in Selector and Dialog, the status signs in Banner and fields, and the
 * caret every collapsible SideNavItem renders for its own expand affordance.
 * Ported 1:1 from the hub (`theme/icons.tsx` there), which is why this file
 * mirrors its structure rather than reusing `theme/icons.tsx`'s meaning
 * vocabulary here — the hub keeps the two vocabularies separate too, because
 * they answer different questions: this one is "what does Astryx itself draw
 * for me", that one is "what does this component mean".
 *
 * `size: '1em'` lets Astryx size these off the surrounding font size. Weight
 * is `bold` for controls (checks, chevrons, tools) — same choice as
 * `outline` in theme/icons.tsx, and for the same reason: a checkmark in a
 * 14px checkbox needs to carry visual weight. The four status glyphs
 * (`success`, `error`, `warning`, `info`) and `chevronDown` carry `fill`
 * instead — Astryx's own default registry calls for full shapes on status
 * glyphs for colour recognisability, and there is no unselected state here
 * to force an outline the way there is for `outline` in theme/icons.tsx.
 *
 * SSR entry, not the regular one: its icons read `IconContext` via
 * `useContext` and would not be importable from Server Components. This
 * module is imported from theme/house.ts, which both server and client code
 * pull in.
 */

import type { IconRegistry } from '@astryxdesign/core/Icon';

import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  ArrowsDownUpIcon,
  CalendarIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ChecksIcon,
  ClockIcon,
  ColumnsIcon,
  CopyIcon,
  DotsThreeIcon,
  EyeSlashIcon,
  FunnelIcon,
  InfoIcon,
  ListIcon,
  MagnifyingGlassIcon,
  MicrophoneIcon,
  StopIcon,
  WarningIcon,
  WrenchIcon,
  XCircleIcon,
  XIcon,
} from '@phosphor-icons/react/ssr';

const iconProps = {
  size: '1em',
  weight: 'bold' as const,
  'aria-hidden': true as const,
  focusable: false as const,
};

/** Status glyphs and the expanded chevron are filled shapes, not outlines. */
const filledIconProps = {
  size: '1em',
  weight: 'fill' as const,
  'aria-hidden': true as const,
  focusable: false as const,
};

export const houseIconRegistry: IconRegistry = {
  close: <XIcon {...iconProps} />,
  chevronDown: <CaretDownIcon {...filledIconProps} />,
  chevronLeft: <CaretLeftIcon {...iconProps} />,
  chevronRight: <CaretRightIcon {...iconProps} />,
  check: <CheckIcon {...iconProps} />,
  success: <CheckCircleIcon {...filledIconProps} />,
  error: <XCircleIcon {...filledIconProps} />,
  warning: <WarningIcon {...filledIconProps} />,
  info: <InfoIcon {...filledIconProps} />,
  calendar: <CalendarIcon {...iconProps} />,
  clock: <ClockIcon {...iconProps} />,
  externalLink: <ArrowSquareOutIcon {...iconProps} />,
  menu: <ListIcon {...iconProps} />,
  moreHorizontal: <DotsThreeIcon {...iconProps} />,
  search: <MagnifyingGlassIcon {...iconProps} />,
  arrowUp: <ArrowUpIcon {...iconProps} />,
  arrowDown: <ArrowDownIcon {...iconProps} />,
  arrowsUpDown: <ArrowsDownUpIcon {...iconProps} />,
  funnel: <FunnelIcon {...iconProps} />,
  eyeSlash: <EyeSlashIcon {...iconProps} />,
  viewColumns: <ColumnsIcon {...iconProps} />,
  copy: <CopyIcon {...iconProps} />,
  checkDouble: <ChecksIcon {...iconProps} />,
  wrench: <WrenchIcon {...iconProps} />,
  stop: <StopIcon {...iconProps} />,
  microphone: <MicrophoneIcon {...iconProps} />,
};
