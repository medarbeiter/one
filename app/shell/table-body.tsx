"use client";

import type { ReactNode } from "react";
import { EmptyState, Table } from "@heroui/react";

/**
 * Table.Body mit Leertext. renderEmptyState ist eine Funktion und lässt sich
 * darum nicht aus einer Server Component durchreichen – der Text schon.
 */
export function TableBody({ empty, children }: { empty: string; children: ReactNode }) {
  return <Table.Body renderEmptyState={() => <EmptyState>{empty}</EmptyState>}>{children}</Table.Body>;
}
