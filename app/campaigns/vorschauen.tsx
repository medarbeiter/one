"use client";

import { useEffect, useState } from "react";
import { Skeleton, Tab, TabList, Text } from "@astryxdesign/core";
import { PREVIEW_GROUPS, PREVIEW_SIZE, type PreviewFormat } from "@/lib/campaigns";

type Gruppe = (typeof PREVIEW_GROUPS)[number]["key"];
const ALLE = PREVIEW_GROUPS.flatMap((g) => g.formats.map(([f]) => f));

/**
 * Metas Instagram-Feed-Mock ist ein Telefonbildschirm mit mehr Inhalt als
 * Höhe – und mit einem Rollbalken an seiner rechten Kante, der von außen nicht
 * abzustellen ist. Die Kante wird deshalb beschnitten: die 15 px eines
 * klassischen Rollbalkens. Die Marke „…“ oben rechts bleibt davor stehen.
 */
// ponytail: fester Schnitt. Wenn Meta den Mock ändert oder Overlay-Rollbalken
// die Regel werden, hier nachmessen statt raten.
const SCHNITT: Partial<Record<PreviewFormat, number>> = { INSTAGRAM_STANDARD: 15 };

/**
 * Metas Vorschauen in drei Reitern – Feed, Reels, Story –, je Reiter beide
 * Plattformen nebeneinander. Woher das HTML kommt, sagt `lade`: eine
 * bestehende Anzeige (adPreviewAction) oder ein Entwurf im Assistenten
 * (wizardPreviewAction). `schluessel` benennt den Entwurf: ändert er sich,
 * wird neu geholt; jede fertige Fassung bleibt solange im Speicher.
 *
 * Alle fünf Formate werden auf einmal geholt und bleiben eingehängt – nur
 * versteckt. Metas Einbettung lädt ein Video und ein halbes Megabyte Skript;
 * das soll einmal beim Öffnen passieren, nicht bei jedem Reiterwechsel.
 */
export function Vorschauen({
  lade,
  schluessel = "",
  ruheMs = 0,
}: {
  lade: (format: PreviewFormat) => Promise<{ html?: string; error?: string }>;
  schluessel?: string;
  /** Wartezeit nach der letzten Änderung, bevor Meta gefragt wird (Tippen). */
  ruheMs?: number;
}) {
  const [gruppe, setGruppe] = useState<Gruppe>("feed");
  const [html, setHtml] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<Record<string, string>>({});

  useEffect(() => {
    const offen = ALLE.filter((f) => !html[`${schluessel}:${f}`]);
    if (!offen.length) return;
    let aktuell = true;
    const uhr = setTimeout(() => {
      // Der offene Reiter zuerst – Server Actions laufen je Browser nacheinander.
      const sichtbar = PREVIEW_GROUPS.find((g) => g.key === gruppe)!.formats.map(([f]) => f as PreviewFormat);
      const reihe = [...offen].sort((a, b) => Number(sichtbar.includes(b)) - Number(sichtbar.includes(a)));
      for (const f of reihe)
        lade(f).then((r) => {
          if (!aktuell) return;
          const k = `${schluessel}:${f}`;
          if (r.html) setHtml((h) => ({ ...h, [k]: r.html! }));
          else setFehler((e) => ({ ...e, [k]: r.error ?? "Keine Vorschau." }));
        });
    }, ruheMs);
    return () => {
      aktuell = false;
      clearTimeout(uhr);
    };
    // gruppe bestimmt nur die Reihenfolge – ein Reiterwechsel holt nichts neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel, ruheMs, lade, html]);

  return (
    <div className="flex flex-col gap-3">
      <TabList value={gruppe} onChange={(v: string) => setGruppe(v as Gruppe)}>
        {PREVIEW_GROUPS.map((g) => (
          <Tab key={g.key} value={g.key} label={g.label} />
        ))}
      </TabList>
      {PREVIEW_GROUPS.map((g) => (
        <div key={g.key} hidden={g.key !== gruppe} className="vorschau flex flex-wrap items-start justify-center gap-6">
          {g.formats.map(([f, name]) => {
            const k = `${schluessel}:${f}`;
            const [w, h] = PREVIEW_SIZE[f];
            const schnitt = SCHNITT[f] ?? 0;
            return (
              <figure key={f} className="flex flex-col items-center gap-2">
                <figcaption>
                  <Text type="supporting" size="sm" color="secondary">{name}</Text>
                </figcaption>
                {html[k] ? (
                  <div style={{ width: w - schnitt, height: h, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: html[k] }} />
                ) : fehler[k] ? (
                  <span className="text-sm" style={{ color: "var(--color-error)", maxWidth: w }}>{fehler[k]}</span>
                ) : (
                  <Skeleton className="rounded-lg" style={{ width: w, height: h }} />
                )}
              </figure>
            );
          })}
        </div>
      ))}
    </div>
  );
}
