"use client";

import type { ReactNode } from "react";
import { List, ListItem, Text } from "@astryxdesign/core";

/**
 * Eine Auskunft, kein Formularfeld.
 *
 * Vorher standen die Auskünfte des Assistenten – „Das steckt hinter dieser
 * Wahl", die Festwerte, die Zusammenfassung – auf derselben weißen Fläche und
 * im selben Rahmen wie die Eingaben direkt darüber. Wer den Schritt überflog,
 * sah eine Reihe gleich aussehender Kästen und musste jeden einzeln daraufhin
 * lesen, ob er etwas von einem will. Auskunft ist aber nichts, woran man dreht.
 *
 * Die Tafel hebt sich deshalb aus dem Formular heraus: Pergament statt Weiß.
 * Getönt ist im Haus, was nichts von einem will (dieselbe Fläche wie die Leiste
 * unter dem Assistenten, `Section variant="muted"`); weiß bleibt, was Eingabe
 * ist. Ein Ton, kein zweiter Schatten – die Karte hat den einen Schritt der
 * Schattenleiter schon vergeben.
 */
export function Infotafel({
  titel,
  children,
  className = "",
}: {
  titel?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    // p-2 statt p-4: der Innenabstand der Zeilen (Astryx' ListItem trägt
    // selbst 8 px) zählt mit, sonst steht der Text 32 px von der Kante weg.
    <div className={`bg-surface-secondary border-line rounded-xl border p-2 ${className}`}>
      {titel ? (
        // px-2 legt die Überschrift auf dieselbe Fluchtlinie wie die Zeilen –
        // Astryx' Kopf trägt nur Abstand nach unten, keinen zur Seite.
        <Text type="large" weight="medium" as="h3" className="px-2 pt-1 pb-1">
          {titel}
        </Text>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Beschriftung/Wert-Paare – die Wahl hinter Schritt 1, die Zusammenfassung der
 * Überprüfung, die Festwerte.
 *
 * Vorher eine `MetadataList`: Beschriftung links, Wert irgendwo rechts daneben,
 * und zwischen den Zeilen nichts. Über eine halbe Kartenbreite hinweg war
 * dabei nicht mehr zu sehen, welcher Wert zu welcher Beschriftung gehört –
 * genau die Frage, für die es Linien gibt. Astryx' `List` beantwortet sie mit
 * `hasDividers`: jede Zeile ein Eintrag, der Wert am rechten Rand, dazwischen
 * der Haarstrich des Hauses. `density="spacious"` gibt die 12 px, die eine
 * Zeile mit zwei Spalten braucht, damit sie nicht als Tabelle liest.
 *
 * Beschriftung in stone, Wert in Tinte: die Beschriftung ist die Frage, der
 * Wert die Antwort, und nur die Antwort ist beim Überfliegen gemeint. Astryx'
 * `label` färbt primär – die Farbe steht deshalb an einem eigenen Span darin,
 * der als Kind gewinnt, ohne gegen StyleX anzutreten.
 */
export function Angaben({ titel, rows }: { titel?: ReactNode; rows: [string, string][] }) {
  return (
    <Infotafel titel={titel}>
      <List hasDividers density="spacious">
        {rows.map(([k, v]) => (
          <ListItem
            key={k}
            label={<span className="text-ink-500">{k}</span>}
            endContent={<span className="text-ink-900 text-end font-medium tabular-nums">{v}</span>}
          />
        ))}
      </List>
    </Infotafel>
  );
}
