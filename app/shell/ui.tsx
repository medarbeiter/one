"use client";

import type { HTMLAttributes } from "react";
import {
  Avatar,
  Badge,
  Banner,
  Card,
  Collapsible,
  CollapsibleGroup,
  Divider,
  EmptyState,
  Heading,
  type HeadingProps,
  Popover,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  type TextProps,
} from "@astryxdesign/core";
import { ToastViewport } from "@astryxdesign/core/Toast";

// Astryx uses flat exports, not HeroUI's compound namespacing (Table.Cell,
// Card.Header, ...). Names that match Astryx's own exports are re-exported
// as-is; names HeroUI used that Astryx spells differently are renamed below.
// Nothing here fakes a shape Astryx does not have — where the shape changed
// (compound children became props), the call sites changed instead.
export {
  Avatar,
  Badge,
  Banner,
  Card,
  Collapsible,
  CollapsibleGroup,
  Divider,
  EmptyState,
  Heading,
  Popover,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
};

// Pure renames — same element, same shape, different spelling.
// HeroUI Chip → Astryx Badge. (The children are the one difference: Badge
// takes a required `label` prop, so the call sites pass it there.)
export { Badge as Chip };
// HeroUI Alert → Astryx Banner. (Title and description are props on Banner,
// not Alert.Title / Alert.Description children — again a call-site change.)
export { Banner as Alert };
// HeroUI Separator → Astryx Divider.
export { Divider as Separator };
// HeroUI Table.Column → Astryx TableHeaderCell. Both render a <th>.
export { TableHeaderCell as TableColumn };
// HeroUI Typography.Heading → Astryx Heading. The `level` prop matches
// one-for-one, so this is a straight rename.
export { Heading as TypographyHeading };

// Astryx has no CardHeader/CardContent/CardTitle — Card has no sub-parts at
// all (just `padding`/`variant`/`elevation`). These stay as one-line wrappers
// so the call sites keep their layout without hand-rolling classes.
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["flex items-center justify-between", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["flex flex-col gap-4", className].filter(Boolean).join(" ")} {...props} />
  );
}

export function CardTitle(props: Omit<HeadingProps, "level">) {
  return <Heading level={3} {...props} />;
}

// TypographyParagraph defaults Text to a block-level <p> — Text itself
// defaults to an inline <span>, since most Text usage is inline.
export function TypographyParagraph({ as = "p", ...props }: TextProps) {
  return <Text as={as} {...props} />;
}

// TypographyCode pins Text's `type="code"` — Astryx's Text has a built-in
// code-styled type, so this needs no HeroUI-shaped fallback.
export function TypographyCode(props: Omit<TextProps, "type">) {
  return <Text type="code" {...props} />;
}

// Deliberately NOT exported, because Astryx has no matching shape and a
// wrapper would hide that difference forever:
//
// - Alert.Content / Alert.Title / Alert.Description → <Banner status title
//   description /> takes them as props.
// - Avatar.Fallback → <Avatar name="…" /> derives the initials itself.
// - Disclosure / Disclosure.Heading / .Trigger / .Indicator / .Content /
//   .Body → <Collapsible trigger={…}>{…}</Collapsible> is one component.
// - Popover.Trigger / .Content / .Dialog / .Heading → Astryx's Popover takes
//   the trigger as `children` and the panel as a `content` prop, and owns the
//   dialog role, labelling and dismissal itself.
// - Table.Content → Astryx's Table *is* the <table>; HeroUI's outer <Table>
//   card wrapper has no counterpart and disappears at the call sites.
// - Typography (the compound root) → Text and Heading are separate.

export function Toasts() {
  return <ToastViewport />;
}
