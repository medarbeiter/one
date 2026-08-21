"use client";

import type { ReactNode } from "react";
import { Tab, TabList } from "@astryxdesign/core";
import { Sign, type Meaning } from "@/theme/icons";

/**
 * Der eine Navigator des Hauses: Reiter links, was sonst noch blättert rechts
 * — 1:1 aus dem Hub übernommen (components/bereichs-leiste.tsx dort).
 *
 * Er steht am Fuß des Kopfbands, nicht in der Filterreihe darunter. Der
 * Unterschied ist kein Layoutgeschmack: ein Reiter wechselt die *Ansicht* auf
 * dieselbe Sache (welcher Zeitraum, welcher Ausschnitt), ein Filter schneidet
 * innerhalb der Ansicht zu. Solange der Zeitraum ein Auswahlfeld neben „Status"
 * und „Ziel" war, sah er aus wie ein Filter und war doch die Ansicht selbst.
 *
 * Die Reiter sind Verweise, keine Knöpfe: die Wahl steht in der Adresse und
 * überlebt damit Zurück-Knopf und geteilten Link. `onChange` bleibt deshalb
 * leer — geklickt wird der Anker, und Next navigiert.
 */
export function Navigator({
  aktiv,
  tabs,
  rechts,
}: {
  aktiv: string;
  tabs: Array<{ value: string; label: string; href: string; meaning: Meaning }>;
  /** Was am anderen Ende der Reihe steht — Schritte, eine Beschriftung. */
  rechts?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* Der offene Bereich trägt sein Zeichen gefüllt — dieselbe Sprache, in
          der die Seitenleiste ihre Auswahl zeigt. 14px, nicht die üblichen 16:
          die Reiterbeschriftung ist Astryx' `label`-Größe, und das Zeichen
          daneben trägt im Hub dieselbe `groesse="zeile"`. */}
      <TabList value={aktiv} onChange={() => {}}>
        {tabs.map((t) => (
          <Tab
            key={t.value}
            value={t.value}
            label={t.label}
            href={t.href}
            icon={<Sign meaning={t.meaning} form="outline" size={14} />}
            selectedIcon={<Sign meaning={t.meaning} form="solid" size={14} />}
          />
        ))}
      </TabList>
      {rechts && <div className="flex items-center gap-2">{rechts}</div>}
    </div>
  );
}
