import { Children, type ReactNode } from "react";
import { EmptyState, TableBody as AstryxTableBody, TableCell, TableRow } from "@astryxdesign/core";

/**
 * Astryx' TableBody mit Leertext. Astryx kennt kein renderEmptyState – der
 * Leerfall ist hier eine gewöhnliche Zeile über alle Spalten, deren Anzahl die
 * Tabelle mitgeben muss (colSpan lässt sich nicht erraten).
 */
export function TableBody({
  empty,
  columns,
  children,
}: {
  empty: string;
  columns: number;
  children: ReactNode;
}) {
  return (
    <AstryxTableBody>
      {Children.count(children) === 0 ? (
        <TableRow>
          <TableCell colSpan={columns}>
            <EmptyState title={empty} isCompact />
          </TableCell>
        </TableRow>
      ) : (
        children
      )}
    </AstryxTableBody>
  );
}
