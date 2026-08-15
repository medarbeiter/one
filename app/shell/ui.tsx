"use client";

import {
  Alert,
  Avatar,
  Card,
  Chip,
  Disclosure,
  DisclosureGroup,
  EmptyState,
  Popover,
  Separator,
  Skeleton,
  Table,
  Toast,
  Typography,
} from "@heroui/react";

export {
  Alert,
  Avatar,
  Card,
  Chip,
  Disclosure,
  DisclosureGroup,
  EmptyState,
  Popover,
  Separator,
  Skeleton,
  Table,
  Typography,
};

export const AlertContent = Alert.Content;
export const AlertDescription = Alert.Description;
export const AlertTitle = Alert.Title;
export const AvatarFallback = Avatar.Fallback;
export const CardContent = Card.Content;
export const CardHeader = Card.Header;
export const CardTitle = Card.Title;
export const DisclosureBody = Disclosure.Body;
export const DisclosureContent = Disclosure.Content;
export const DisclosureHeading = Disclosure.Heading;
export const DisclosureIndicator = Disclosure.Indicator;
export const DisclosureTrigger = Disclosure.Trigger;
export const PopoverContent = Popover.Content;
export const PopoverDialog = Popover.Dialog;
export const PopoverHeading = Popover.Heading;
export const PopoverTrigger = Popover.Trigger;
export const TableCell = Table.Cell;
export const TableColumn = Table.Column;
export const TableContent = Table.Content;
export const TableHeader = Table.Header;
export const TableRow = Table.Row;
export const TypographyCode = Typography.Code;
export const TypographyHeading = Typography.Heading;
export const TypographyParagraph = Typography.Paragraph;

export function Toasts() {
  return <Toast.Provider />;
}
