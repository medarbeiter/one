"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as UI from "@/app/shell/ui";
import { Table } from "@/app/shell/ui";
import { TableBody } from "@/app/shell/table-body";
import { label } from "@/lib/labels";
import type { Campaign, Period } from "@/lib/campaigns";
import { KENNZAHLEN, kennzahl } from "./kennzahlen";
import { BudgetField, StatusSwitch } from "./row-controls";

/** Welche Kennzahlen in der Tabelle stehen – die Kacheln der Kampagnenseite zeigen alle. */
const SPALTEN = ["spend", "leads", "cpl", "reach", "clicks", "ctr", "cpm"].map(kennzahl);

type Sort = { key: string; richtung: 1 | -1 };

/**
 * Die Kampagnentabelle: sortierbar im Browser, weil alle Zahlen schon da sind.
 * Der Zeitraum kommt von der Adresse (Reiter im Kopf); die Zeilen tragen die
 * Kennzahlen aller vier Zeiträume, gelesen wird der eine.
 */
export function CampaignTable({
  rows,
  period,
  scoped,
}: {
  rows: Campaign[];
  period: Period;
  /** Ein Kunde gewählt – dann steht sein Name nicht in jeder Zeile. */
  scoped: boolean;
}) {
  const [sort, setSort] = useState<Sort>({ key: "spend", richtung: -1 });

  const sortiert = useMemo(() => {
    const k = KENNZAHLEN.find((x) => x.key === sort.key);
    const wert = (c: Campaign) => k?.wert(c.insights?.[period]);
    return [...rows].sort((a, b) => {
      const x = wert(a);
      const y = wert(b);
      // Ohne Wert ans Ende, egal in welche Richtung sortiert wird.
      if (x === undefined) return y === undefined ? 0 : 1;
      if (y === undefined) return -1;
      return (x - y) * sort.richtung;
    });
  }, [rows, period, sort]);

  const maxLeads = Math.max(0, ...rows.map((c) => kennzahl("leads").wert(c.insights?.[period]) ?? 0));

  const klick = (key: string) =>
    setSort((s) =>
      s.key === key
        ? { key, richtung: s.richtung === 1 ? -1 : 1 }
        : { key, richtung: kennzahl(key).kosten ? 1 : -1 },
    );

  return (
    <Table aria-label="Kampagnen">
      <UI.TableHeader>
        <UI.TableRow isHeaderRow>
          <UI.TableColumn>Kampagne</UI.TableColumn>
          <UI.TableColumn>Status</UI.TableColumn>
          <UI.TableColumn>Tagesbudget</UI.TableColumn>
          {SPALTEN.map((k) => (
            <UI.TableColumn
              key={k.key}
              aria-sort={sort.key === k.key ? (sort.richtung === 1 ? "ascending" : "descending") : undefined}
            >
              <button
                type="button"
                title={k.hilfe}
                onClick={() => klick(k.key)}
                className="hover:text-ink-900 inline-flex items-center gap-1 whitespace-nowrap underline decoration-dotted underline-offset-4"
              >
                {k.label}
                <span aria-hidden className="w-2 text-[10px]">
                  {sort.key === k.key ? (sort.richtung === 1 ? "▲" : "▼") : ""}
                </span>
              </button>
            </UI.TableColumn>
          ))}
        </UI.TableRow>
      </UI.TableHeader>
      <TableBody
        columns={3 + SPALTEN.length}
        empty="Keine Kampagnen in diesem Zeitraum. Wähle einen längeren Zeitraum oder entferne einen Filter."
      >
        {sortiert.map((c) => {
          const i = c.insights?.[period];
          const leads = kennzahl("leads").wert(i) ?? 0;
          return (
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
        })}
      </TableBody>
    </Table>
  );
}
