"use client";

import { useEffect, useState } from "react";
import { Skeleton, Tab, TabList, Text } from "@astryxdesign/core";
import { PREVIEW_GROUPS, PREVIEW_SIZE, type PreviewFormat } from "@/lib/campaigns";

type Gruppe = (typeof PREVIEW_GROUPS)[number]["key"];

/**
 * Metas Vorschauen in drei Reitern – Feed, Reels, Story –, je Reiter beide
 * Plattformen nebeneinander. Woher das HTML kommt, sagt `lade`: eine
 * bestehende Anzeige (adPreviewAction) oder ein Entwurf im Assistenten
 * (wizardPreviewAction). `schluessel` benennt den Entwurf: ändert er sich,
 * wird neu geholt; jede fertige Fassung bleibt solange im Speicher.
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
  const formate = PREVIEW_GROUPS.find((g) => g.key === gruppe)!.formats;

  useEffect(() => {
    const offen = formate.map(([f]) => f).filter((f) => !html[`${schluessel}:${f}`]);
    if (!offen.length) return;
    let aktuell = true;
    const uhr = setTimeout(() => {
      for (const f of offen)
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
  }, [formate, schluessel, ruheMs, lade, html]);

  return (
    <div className="flex flex-col gap-3">
      <TabList value={gruppe} onChange={(v: string) => setGruppe(v as Gruppe)}>
        {PREVIEW_GROUPS.map((g) => (
          <Tab key={g.key} value={g.key} label={g.label} />
        ))}
      </TabList>
      <div className="vorschau flex flex-wrap items-start justify-center gap-6">
        {formate.map(([f, name]) => {
          const k = `${schluessel}:${f}`;
          const [w, h] = PREVIEW_SIZE[f];
          return (
            <figure key={f} className="flex flex-col items-center gap-2">
              <figcaption>
                <Text type="supporting" size="sm" color="secondary">{name}</Text>
              </figcaption>
              {html[k] ? (
                <div dangerouslySetInnerHTML={{ __html: html[k] }} />
              ) : fehler[k] ? (
                <span className="text-sm" style={{ color: "var(--color-error)", maxWidth: w }}>{fehler[k]}</span>
              ) : (
                <Skeleton className="rounded-lg" style={{ width: w, height: h }} />
              )}
            </figure>
          );
        })}
      </div>
    </div>
  );
}
