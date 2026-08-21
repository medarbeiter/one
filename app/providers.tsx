"use client";

import { LayerProvider } from "@astryxdesign/core";
import { Theme } from "@astryxdesign/core/theme";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { houseTheme } from "@/theme/house";
import de from "@/locales/de.json";
import type { ReactNode } from "react";

/**
 * Ohne diesen Anbieter greifen Astryx-Komponenten auf ihren mitgelieferten
 * englischen Katalog zurück — der Leeren-Knopf im Suchfeld hieße "Clear
 * Suche" statt "Suche leeren". `Theme` setzt `mode="light"` und rendert dafür
 * selbst einen Wrapper mit `data-astryx-theme` um `children` — ohne ihn
 * bliebe Astryx bei seiner Vorgabe `mode="system"`, und jedes `light-dark()`
 * im Stylesheet folgte der Betriebssystem-Einstellung statt dem Haus (Hub
 * macht dasselbe in seinem `providers.tsx`, 1:1).
 *
 * `LayerProvider` steht mit Absicht *innerhalb* von Sprache und Thema: er
 * trägt den Ort, an dem `useToast` seine Meldungen ablegt. Ohne ihn (oder mit
 * ihm nur als Geschwister des restlichen Baums, wie zuvor in app/layout.tsx)
 * findet `useToast` seinen `ToastContext` nirgends und weicht auf eine
 * eigene, losgelöste React-Wurzel neben dem `<body>` aus – ohne Katalog oder
 * Thema von oben. Ein Anbieter hier kostet nichts und behebt das, indem er
 * `children` tatsächlich umschließt.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <InternationalizationProvider locale="de" messages={{ de }}>
      <Theme theme={houseTheme} mode="light">
        <LayerProvider toast={{ position: "bottomEnd", maxVisible: 3 }}>{children}</LayerProvider>
      </Theme>
    </InternationalizationProvider>
  );
}
