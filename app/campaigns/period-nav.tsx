import { Navigator } from "@/app/shell/navigator";
import type { Period } from "@/lib/campaigns";
import type { Meaning } from "@/theme/icons";
import type { SearchParams } from "@/app/shell/facets";

/**
 * Die vier Zeiträume, in Zoom-Reihenfolge — von einem Tag bis zum ganzen
 * Bestand. Sie standen bisher als Auswahlfeld „Zeitraum" zwischen „Status" und
 * „Ziel" in der Filterreihe und sahen damit aus wie ein Filter. Sie sind aber
 * keiner: ein Filter schneidet die Liste zu, der Zeitraum bestimmt, *welche
 * Zahlen* in ihr stehen. Deshalb sind sie jetzt Reiter am Fuß des Kopfbands —
 * dieselbe Stelle und dieselbe Bedeutung wie die Bereichsreiter im Hub
 * (components/bereichs-leiste.tsx dort).
 */
const PERIODS: Array<{ value: Period; label: string; meaning: Meaning }> = [
  { value: "today", label: "Heute", meaning: "periodDay" },
  { value: "last_7d", label: "Letzte 7 Tage", meaning: "periodWeek" },
  { value: "last_30d", label: "Letzte 30 Tage", meaning: "periodMonth" },
  { value: "maximum", label: "Gesamt", meaning: "periodTotal" },
];

/** Vorgabe, wenn die Adresse nichts sagt: die Woche, nicht der Tag. */
export const DEFAULT_PERIOD: Period = "last_7d";

export const readPeriod = (sp: SearchParams): Period =>
  (PERIODS.find((p) => p.value === sp.period)?.value ?? DEFAULT_PERIOD);

/**
 * Der Navigator der Kampagnenansicht. Die Wahl steht in der Adresse und nimmt
 * alles mit, was sonst noch darin steht — ein Wechsel des Zeitraums darf den
 * Kunden-Scope, die Suche und die Filter nicht abwerfen.
 */
export function PeriodNav({
  route,
  period,
  params,
}: {
  route: string;
  period: Period;
  params: SearchParams;
}) {
  const href = (wert: Period) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (typeof v === "string" && k !== "period") next.set(k, v);
    next.set("period", wert);
    return `${route}?${next.toString()}`;
  };

  return (
    <Navigator
      aktiv={period}
      tabs={PERIODS.map((p) => ({
        value: p.value,
        label: p.label,
        href: href(p.value),
        meaning: p.meaning,
      }))}
    />
  );
}
