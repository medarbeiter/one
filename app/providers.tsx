"use client";

import { LayerProvider } from "@astryxdesign/core";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import de from "@/locales/de.json";
import type { ReactNode } from "react";

/**
 * Ohne diesen Anbieter greifen Astryx-Komponenten auf ihren mitgelieferten
 * englischen Katalog zurück — der Leeren-Knopf im Suchfeld hieße "Clear
 * Suche" statt "Suche leeren". Theming bleibt getrennt: `data-astryx-theme`
 * sitzt weiterhin am `<html>` in `app/layout.tsx`, hier geht es nur um
 * Sprache.
 *
 * `LayerProvider` steht mit Absicht *innerhalb* der Sprache: er trägt den
 * Ort, an dem `useToast` seine Meldungen ablegt. Ohne ihn (oder mit ihm nur
 * als Geschwister des restlichen Baums, wie zuvor in app/layout.tsx) findet
 * `useToast` seinen `ToastContext` nirgends und weicht auf eine eigene,
 * losgelöste React-Wurzel neben dem `<body>` aus – ohne den deutschen
 * Katalog von oben. Ein Anbieter hier kostet nichts und behebt das, indem er
 * `children` tatsächlich umschließt.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <InternationalizationProvider locale="de" messages={{ de }}>
      <LayerProvider>{children}</LayerProvider>
    </InternationalizationProvider>
  );
}
