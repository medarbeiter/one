"use client";

import { Badge } from "@astryxdesign/core";
import type { Source } from "@/lib/brief";

export const HERKUNFT_LABEL: Record<Source, string> = {
  clickup: "aus ClickUp",
  onboarding: "aus der Onboarding-Tabelle",
  previous: "aus der letzten Kampagne",
  session: "aus der Anmeldung",
  user: "aus deinem Hinweis",
  campaign: "aus der Vorlage",
};

// Kurzformen fürs Verbinden: „aus ClickUp + Onboarding“ liest sich, „aus
// ClickUp + aus der Onboarding-Tabelle“ nicht.
const KURZ: Record<Source, string> = {
  clickup: "ClickUp",
  onboarding: "Onboarding",
  previous: "der letzten Kampagne",
  session: "der Anmeldung",
  user: "deinem Hinweis",
  campaign: "der Vorlage",
};

/** Eine Quelle wie bisher, mehrere in gegebener Reihenfolge mit „+“ verbunden. */
export function herkunftLabel(source?: Source | Source[]): string | undefined {
  const sources = source === undefined ? [] : Array.isArray(source) ? source : [source];
  if (!sources.length) return undefined;
  return sources.length === 1 ? HERKUNFT_LABEL[sources[0]] : `aus ${sources.map((s) => KURZ[s]).join(" + ")}`;
}

/**
 * Woher ein vorbelegter Wert stammt. Ein Etikett, kein Satz: es steht an
 * jedem gefüllten Feld, und wer es liest, soll den Wert prüfen, nicht die
 * Herkunft studieren. Verschwindet, sobald jemand das Feld ändert (edited).
 */
export function Herkunft({ source }: { source?: Source | Source[] }) {
  const label = herkunftLabel(source);
  if (!label) return null;
  return <Badge variant="neutral" label={label} className="text-xs" />;
}
