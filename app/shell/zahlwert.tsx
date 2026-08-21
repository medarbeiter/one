"use client";

import type { ReactNode } from "react";

/**
 * Eine Zahl, die sich ändert. 1:1 aus dem Hub übernommen
 * (components/zahlwert.tsx dort).
 *
 * Die Zahlen dieser Anwendung stehen nicht still: die Ausgaben eines Zeitraums
 * kippen beim Wechsel von „Letzte 7 Tage" auf „Gesamt", der Kundenzähler
 * schrumpft beim Tippen in der Suche. Wird eine solche Zahl einfach
 * ausgetauscht, blinzelt sie — man merkt, dass sich etwas geändert hat, aber
 * nicht, dass es *dieselbe* Zahl mit einem neuen Wert ist.
 *
 * Deshalb setzt sie sich von unten an ihren Platz (siehe `.zahlwert` in
 * globals.css). Der `key` ist der Wert selbst: React hängt das Element bei
 * jedem neuen Wert neu auf, und nur ein neuer Knoten lässt eine CSS-Animation
 * wieder von vorn laufen. Bleibt der Wert gleich, passiert nichts — ein
 * Filterklick, der die Summe nicht bewegt, darf die Zahl nicht zappeln lassen.
 *
 * Zum Vorlesen bleibt es ein einziger Textknoten: der Wert wird nicht in
 * Ziffern zerlegt, die eine Sprachausgabe dann einzeln buchstabieren würde.
 */
export function Zahlwert({ wert }: { wert: ReactNode }) {
  // Nur echte Werte tragen einen Schlüssel. Die Ladefläche (loading.tsx reicht
  // ein Skelett als Figur herein) ist kein Wert, der sich ändert, sondern ein
  // Platzhalter — sie soll nicht bei jedem Rendern neu hereinrollen.
  const schluessel = typeof wert === "string" || typeof wert === "number" ? String(wert) : undefined;
  return (
    <span key={schluessel} className={schluessel === undefined ? undefined : "zahlwert"}>
      {wert}
    </span>
  );
}
