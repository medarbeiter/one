"use client";

import { Badge } from "@astryxdesign/core";
import type { Source } from "@/lib/brief";

export const HERKUNFT_LABEL: Record<Source, string> = {
  clickup: "aus ClickUp",
  onboarding: "aus der Onboarding-Tabelle",
  previous: "aus der letzten Kampagne",
  session: "aus der Anmeldung",
};

/**
 * Woher ein vorbelegter Wert stammt. Ein Etikett, kein Satz: es steht an
 * jedem gefüllten Feld, und wer es liest, soll den Wert prüfen, nicht die
 * Herkunft studieren. Verschwindet, sobald jemand das Feld ändert (edited).
 */
export function Herkunft({ source }: { source?: Source }) {
  if (!source) return null;
  return <Badge variant="neutral" label={HERKUNFT_LABEL[source]} className="text-xs" />;
}
