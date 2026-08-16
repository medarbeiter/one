"use client";

import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import de from "@/locales/de.json";
import type { ReactNode } from "react";

/**
 * Ohne diesen Anbieter greifen Astryx-Komponenten auf ihren mitgelieferten
 * englischen Katalog zurück — der Leeren-Knopf im Suchfeld hieße "Clear
 * Suche" statt "Suche leeren". Theming bleibt getrennt: `data-astryx-theme`
 * sitzt weiterhin am `<html>` in `app/layout.tsx`, hier geht es nur um
 * Sprache.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <InternationalizationProvider locale="de" messages={{ de }}>
      {children}
    </InternationalizationProvider>
  );
}
