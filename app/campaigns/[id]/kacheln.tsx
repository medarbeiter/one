import type { Insights } from "@/lib/campaigns";
import { KENNZAHLEN, kennzahl } from "../kennzahlen";

/** Alle Kennzahlen als Kacheln; `kompakt` als eine Zeile für Anzeigengruppen und Anzeigen. */
export function Kacheln({ insights, kompakt }: { insights?: Insights; kompakt?: boolean }) {
  const liste = kompakt ? ["spend", "leads", "cpl", "reach", "clicks", "ctr", "cpc", "cpm"].map(kennzahl) : KENNZAHLEN;
  return (
    <dl className={kompakt ? "flex flex-wrap gap-x-5 gap-y-2 text-sm" : "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"}>
      {liste.map((k) => (
        <div key={k.key} title={k.hilfe}>
          <dt className="text-ink-500 text-xs">{k.label}</dt>
          <dd className={`font-display text-ink-900 tabular-nums ${kompakt ? "" : "text-xl"}`}>{k.format(k.wert(insights))}</dd>
        </div>
      ))}
    </dl>
  );
}
