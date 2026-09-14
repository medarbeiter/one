"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as UI from "@/app/shell/ui";
import { Badge, Table } from "@/app/shell/ui";
import { TableBody } from "@/app/shell/table-body";
import { label } from "@/lib/labels";
import { adsManagerUrl, type Campaign, type Period } from "@/lib/campaigns";
import { stufe, type Befund } from "@/lib/befund";
import { KENNZAHLEN, kennzahl } from "./kennzahlen";
import { BudgetField, StatusSwitch } from "./row-controls";

/** Welche Kennzahlen in der Tabelle stehen – die Kacheln der Kampagnenseite zeigen alle. */
const SPALTEN = ["spend", "leads", "cpl", "reach", "clicks", "ctr", "cpm"].map(kennzahl);

type Sort = { key: string; richtung: 1 | -1 };

const RANG = { rot: 2, gelb: 1, ok: 0 } as const;
const MARKE = {
  rot: { variant: "error", label: "Kritisch" },
  gelb: { variant: "warning", label: "Prüfen" },
  ok: { variant: "success", label: "Läuft" },
} as const;

/**
 * Die Kampagnentabelle: sortierbar im Browser, weil alle Zahlen schon da sind.
 * Der Zeitraum kommt von der Adresse (Reiter im Kopf); die Zeilen tragen die
 * Kennzahlen aller vier Zeiträume, gelesen wird der eine.
 *
 * Die Spalte „Befund“ sagt, ob etwas zu tun ist; ein Klick darauf klappt
 * unter der Zeile auf, *warum* und *was* – mit den Wegen dorthin.
 */
export function CampaignTable({
  rows,
  befunde,
  period,
  scoped,
}: {
  rows: Campaign[];
  befunde: Record<string, Befund[]>;
  period: Period;
  /** Ein Kunde gewählt – dann steht sein Name nicht in jeder Zeile. */
  scoped: boolean;
}) {
  const [sort, setSort] = useState<Sort>({ key: "befund", richtung: -1 });
  const [offen, setOffen] = useState<string | null>(null);

  const rang = (c: Campaign) => {
    const s = stufe(c, befunde[c.id] ?? []);
    return s === undefined ? undefined : RANG[s];
  };

  const sortiert = useMemo(() => {
    const k = KENNZAHLEN.find((x) => x.key === sort.key);
    const wert = (c: Campaign) => (sort.key === "befund" ? rang(c) : k?.wert(c.insights?.[period]));
    // Bei gleichem Befund entscheidet das Geld – die teuerste Baustelle zuerst.
    const geld = (c: Campaign) => kennzahl("spend").wert(c.insights?.[period]) ?? 0;
    return [...rows].sort((a, b) => {
      const x = wert(a);
      const y = wert(b);
      // Ohne Wert ans Ende, egal in welche Richtung sortiert wird.
      if (x === undefined) return y === undefined ? 0 : 1;
      if (y === undefined) return -1;
      return (x - y) * sort.richtung || geld(b) - geld(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, befunde, period, sort]);

  const maxLeads = Math.max(0, ...rows.map((c) => kennzahl("leads").wert(c.insights?.[period]) ?? 0));

  const klick = (key: string) =>
    setSort((s) =>
      s.key === key
        ? { key, richtung: s.richtung === 1 ? -1 : 1 }
        : { key, richtung: key !== "befund" && kennzahl(key).kosten ? 1 : -1 },
    );

  const kopf = (key: string, text: string, hilfe: string) => (
    <UI.TableColumn
      key={key}
      aria-sort={sort.key === key ? (sort.richtung === 1 ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        title={hilfe}
        onClick={() => klick(key)}
        className="hover:text-ink-900 inline-flex items-center gap-1 whitespace-nowrap underline decoration-dotted underline-offset-4"
      >
        {text}
        <span aria-hidden className="w-2 text-[10px]">
          {sort.key === key ? (sort.richtung === 1 ? "▲" : "▼") : ""}
        </span>
      </button>
    </UI.TableColumn>
  );

  const spalten = 4 + SPALTEN.length;

  return (
    <Table aria-label="Kampagnen">
      <UI.TableHeader>
        <UI.TableRow isHeaderRow>
          <UI.TableColumn>Kampagne</UI.TableColumn>
          {kopf("befund", "Befund", "Ob etwas zu tun ist – Klick auf die Marke sagt, was und warum.")}
          <UI.TableColumn>Status</UI.TableColumn>
          <UI.TableColumn>Tagesbudget</UI.TableColumn>
          {SPALTEN.map((k) => kopf(k.key, k.label, k.hilfe))}
        </UI.TableRow>
      </UI.TableHeader>
      <TableBody
        columns={spalten}
        empty="Keine Kampagnen in diesem Zeitraum. Wähle einen längeren Zeitraum oder entferne einen Filter."
      >
        {sortiert.flatMap((c) => {
          const i = c.insights?.[period];
          const leads = kennzahl("leads").wert(i) ?? 0;
          const b = befunde[c.id] ?? [];
          const s = stufe(c, b);
          const auf = offen === c.id;
          const zeile = (
            <UI.TableRow key={c.id} id={c.id}>
              <UI.TableCell scope="row">
                <Link href={`/campaigns/${c.id}`} className="block hover:underline">
                  <span className="text-ink-900 block font-medium">{c.name}</span>
                  <span className="text-ink-500 block text-xs">
                    {[scoped ? undefined : c.customerName, label(c.objective)].filter(Boolean).join(" · ")}
                  </span>
                </Link>
                <span className="text-ink-500 block text-xs">
                  <Link href={`/campaigns/new?from=${c.id}`} className="hover:underline">Duplizieren</Link>
                  {" · "}
                  <Link href={`/campaigns/new?edit=${c.id}`} className="hover:underline">Bearbeiten</Link>
                </span>
              </UI.TableCell>
              <UI.TableCell>
                {s === undefined ? (
                  <span className="text-ink-500 text-xs">—</span>
                ) : (
                  <button
                    type="button"
                    aria-expanded={auf}
                    aria-controls={`befund-${c.id}`}
                    disabled={s === "ok"}
                    onClick={() => setOffen(auf ? null : c.id)}
                    className="inline-flex items-center gap-1.5 disabled:cursor-default"
                    title={b.map((x) => x.titel).join(" · ") || "Nichts auffällig."}
                  >
                    <Badge variant={MARKE[s].variant} label={MARKE[s].label} />
                    {b.length > 0 && (
                      <span className="text-ink-500 text-xs tabular-nums">
                        {b.length} {auf ? "▴" : "▾"}
                      </span>
                    )}
                  </button>
                )}
              </UI.TableCell>
              <UI.TableCell>
                <StatusSwitch id={c.id} name={c.name} status={c.status} />
              </UI.TableCell>
              <UI.TableCell>
                <BudgetField id={c.id} name={c.name} cents={c.daily_budget !== undefined ? Number(c.daily_budget) : undefined} />
              </UI.TableCell>
              {SPALTEN.map((k) => (
                <UI.TableCell key={k.key} className="tabular-nums">
                  {k.key === "leads" ? (
                    // Der Balken macht die Verteilung über die Liste sichtbar,
                    // die Zahl bleibt daneben – Ink, nicht Gold (DESIGN.md).
                    <span className="flex items-center gap-2">
                      <span className="w-8 text-right">{k.format(k.wert(i))}</span>
                      <span className="bg-ink-200 block h-1.5 w-16 overflow-hidden rounded-full">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${maxLeads ? (leads / maxLeads) * 100 : 0}%`, background: "var(--color-icon-secondary)" }}
                        />
                      </span>
                    </span>
                  ) : (
                    k.format(k.wert(i))
                  )}
                </UI.TableCell>
              ))}
            </UI.TableRow>
          );
          if (!auf) return [zeile];
          return [
            zeile,
            <UI.TableRow key={`${c.id}-befund`} id={`befund-${c.id}`}>
              <UI.TableCell colSpan={spalten} className="bg-canvas">
                <div className="flex flex-col gap-3 py-1">
                  <ul className="flex flex-col gap-2">
                    {b.map((x) => (
                      <li key={x.titel} className="flex flex-col gap-0.5 text-sm">
                        <span className="flex items-center gap-2">
                          <Badge variant={MARKE[x.stufe].variant} label={x.titel} />
                        </span>
                        <span className="text-ink-700">{x.warum}</span>
                        <span className="text-ink-900">
                          <span className="text-ink-500">Dagegen: </span>
                          {x.tipp}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <span className="text-ink-500 flex flex-wrap gap-x-3 text-xs">
                    <Link href={`/campaigns/new?edit=${c.id}`} className="text-ink-900 hover:underline">Bearbeiten</Link>
                    <Link href={`/campaigns/${c.id}`} className="text-ink-900 hover:underline">Anzeigen &amp; Verlauf</Link>
                    <Link href={`/campaigns/new?from=${c.id}`} className="text-ink-900 hover:underline">Als Vorlage duplizieren</Link>
                    {c.adAccount && (
                      <a href={adsManagerUrl(c.adAccount, c.id)} target="_blank" rel="noreferrer" className="text-ink-900 hover:underline">
                        Im Ads Manager öffnen ↗
                      </a>
                    )}
                  </span>
                </div>
              </UI.TableCell>
            </UI.TableRow>,
          ];
        })}
      </TableBody>
    </Table>
  );
}
