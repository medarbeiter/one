"use client";

import { Button, Kbd, Text } from "@astryxdesign/core";
import {
  CommandPalette,
  CommandPaletteInput,
} from "@astryxdesign/core/CommandPalette";
import type { SearchSource, SearchableItem } from "@astryxdesign/core/Typeahead";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Treffer } from "@/lib/suche";
import { Sign } from "@/theme/icons";

type SuchItem = SearchableItem<{ group: string; zusatz?: string; meaning: Treffer["meaning"] }>;

/**
 * Wie lange die Suche wartet, bevor sie fragt.
 *
 * Getippt wird in Schüben, nicht in Buchstaben: „kunde" wären fünf Fragen an
 * den Server, von denen vier niemand liest. Eine knappe Fünftelsekunde nach dem
 * letzten Anschlag ist kürzer als der Blick zur Liste und spart die vier.
 * Solange gewartet wird, filtert die Palette die vorigen Treffer selbst weiter
 * — die Liste steht also nie still und blinkt nie leer.
 */
const RUHE_MS = 180;

/** Ein Wartezeitraum, den ein neuer Anschlag abbrechen kann. */
function ruhe(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((weiter, abbrechen) => {
    const uhr = setTimeout(weiter, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(uhr);
        abbrechen(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Die Suche über das ganze Haus — 1:1 aus dem Hub übernommen
 * (components/suche.tsx dort), auf den Bestand dieses Hauses gekürzt.
 *
 * Ihr Ort ist der Anfang der Leiste: ganz links, vor der ersten Angabe, auf
 * jeder Route dieselbe Stelle — unabhängig davon, ob die Seitenleiste gerade
 * offen, schmal oder eingeklappt ist. In der Seitenleiste wäre sie ein Weg
 * unter Wegen; hier ist sie das, was sie ist — die Abkürzung zu jedem von
 * ihnen. Sie trägt dabei nichts Eigenes: derselbe Knopf wie die Handlung am
 * anderen Ende derselben Leiste. Und sie ist nie der einzige Weg: alles, was
 * sie findet, steht auch auf einer Seite, die man erklicken kann.
 */
export function Suche() {
  const [offen, setOffen] = useState(false);
  const router = useRouter();

  /** id → Adresse. Die Palette gibt beim Auswählen nur die Kennung zurück. */
  const wege = useRef(new Map<string, string>());

  // Strg/Cmd + K, wie überall. Nicht die einzige Tür: die Pille selbst ist ein
  // Knopf, damit ein Gerät ohne Tastatur nichts verliert.
  useEffect(() => {
    const horcher = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOffen((zu) => !zu);
      }
    };
    window.addEventListener("keydown", horcher);
    return () => window.removeEventListener("keydown", horcher);
  }, []);

  const quelle = useMemo<SearchSource<SuchItem>>(() => {
    let abbruch: AbortController | null = null;
    const hole = async (frage: string, warten: boolean): Promise<SuchItem[]> => {
      abbruch?.abort();
      const eigen = new AbortController();
      abbruch = eigen;
      try {
        if (warten) await ruhe(RUHE_MS, eigen.signal);
        const antwort = await fetch(`/api/suche?q=${encodeURIComponent(frage)}`, {
          signal: eigen.signal,
        });
        if (!antwort.ok) return [];
        const treffer: Treffer[] = await antwort.json();
        return treffer.map(({ id, label, gruppe, zusatz, href, meaning }) => {
          wege.current.set(id, href);
          return { id, label, auxiliaryData: { group: gruppe, zusatz, meaning } };
        });
      } catch {
        // Ein abgebrochener Abruf ist der Normalfall beim Weitertippen, und ein
        // fehlgeschlagener sagt „nichts gefunden" — eine Suche ist kein Ort für
        // eine Fehlermeldung über sich selbst.
        return [];
      }
    };
    return {
      search: (frage) => hole(frage, true),
      // Das leere Blatt kommt sofort: es hängt an keinem Anschlag.
      bootstrap: () => hole("", false),
      cancel: () => abbruch?.abort(),
    };
  }, []);

  const gehe = useCallback(
    (id: string) => {
      const href = wege.current.get(id);
      if (href) router.push(href);
    },
    [router],
  );

  return (
    <>
      {/* Zeichen, Wort, Tastenkürzel — in dieser Reihenfolge zu lesen und in
          dieser Reihenfolge zu benutzen. Sonst nichts: kein eigener Schatten,
          keine eigene Form. Was in der Leiste steht, sieht aus wie die Leiste. */}
      <Button
        label="Suchen"
        variant="secondary"
        icon={<Sign meaning="search" />}
        endContent={<Kbd keys="mod+k" />}
        onClick={() => setOffen(true)}
      />
      <CommandPalette<SuchItem>
        isOpen={offen}
        onOpenChange={setOffen}
        searchSource={quelle}
        onValueChange={gehe}
        label="Suche"
        input={<CommandPaletteInput placeholder="Wonach suchst du?" label="Suche" />}
        emptyBootstrapText="Tippe einen Kundennamen oder einen Bereich"
        emptySearchText="Nichts gefunden — andere Schreibweise?"
        footer={
          // Ränder, damit die Hinweise nicht in den Ecken des Blattes kleben —
          // sie sind eine Fußnote, keine Kante.
          <div className="flex items-center justify-center gap-6 px-4 py-2">
            <Hinweis text="Bewegen">
              <Kbd keys="up" />
              <Kbd keys="down" />
            </Hinweis>
            <Hinweis text="Öffnen">
              <Kbd keys="enter" />
            </Hinweis>
            <Hinweis text="Schließen">
              <Kbd keys="escape" />
            </Hinweis>
          </div>
        }
        renderItem={(item) => <Zeile item={item} />}
      />
    </>
  );
}

function Hinweis({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-nowrap items-center gap-2">
      <div className="flex flex-nowrap items-center gap-1">{children}</div>
      <Text type="supporting" size="sm" color="secondary">
        {text}
      </Text>
    </div>
  );
}

/**
 * Eine Trefferzeile: Zeichen, Name, und darunter das, was ihn von seinen
 * Geschwistern unterscheidet.
 */
function Zeile({ item }: { item: SuchItem }) {
  const daten = item.auxiliaryData;
  return (
    <div className="flex flex-nowrap items-center gap-3">
      {daten && (
        <Sign meaning={daten.meaning} color="var(--color-icon-secondary)" />
      )}
      <div className="flex min-w-0 flex-col">
        <Text type="label" size="sm" maxLines={1}>
          {item.label}
        </Text>
        {daten?.zusatz && (
          <Text type="supporting" size="sm" color="secondary" maxLines={1}>
            {daten.zusatz}
          </Text>
        )}
      </div>
    </div>
  );
}
