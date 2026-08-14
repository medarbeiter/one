import Link from "next/link";
import { Alert, Chip, Table, Typography } from "@/app/shell/ui";
import { costPerResult, listCampaigns, type Period } from "@/lib/campaigns";
import { findCustomer, listCustomers } from "@/lib/customers";
import { label } from "@/lib/labels";
import { ActiveFilters, FacetSearch, FacetSelect, Facets } from "@/app/shell/facets";
import { TableBody } from "@/app/shell/table-body";
import { StatusSwitch, BudgetField } from "./row-controls";

const PERIODS: [string, string][] = [
  ["today", "Heute"],
  ["last_7d", "Letzte 7 Tage"],
  ["last_30d", "Letzte 30 Tage"],
  ["maximum", "Gesamt"],
];

// Fehlende Kennzahlen sind "—", nicht "undefined"/"NaN"/"€NaN" – viele Kunden
// tragen in einem Zeitraum schlicht keine Kampagnen bei.
const money = (n?: number, currency = "EUR") =>
  n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = (str("period") ?? "last_7d") as Period;

  const { customers } = await listCustomers();
  const scope = findCustomer(customers, str("customer"));
  const { campaigns, errors } = await listCampaigns(scope ? [scope] : customers, period);

  const q = str("q")?.toLowerCase();
  const rows = campaigns.filter(
    (c) =>
      (!str("status") || c.status === str("status")) &&
      (!str("objective") || c.objective === str("objective")) &&
      (!q || c.name.toLowerCase().includes(q)),
  );

  const objectives = [...new Set(campaigns.map((c) => c.objective))].map(
    (o) => [o, label(o)] as [string, string],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Typography.Heading level={1} className="font-display text-xl">
          Kampagnen
        </Typography.Heading>
        <Chip size="sm" variant="soft" className="tabular-nums">
          {rows.length}
        </Chip>
      </div>

      <Facets customer={str("customer")}>
        <FacetSelect
          name="status"
          label="Status"
          value={str("status")}
          options={[
            ["ACTIVE", "Aktiv"],
            ["PAUSED", "Pausiert"],
            ["ARCHIVED", "Archiviert"],
          ]}
        />
        <FacetSelect name="objective" label="Ziel" value={str("objective")} options={objectives} />
        <FacetSelect
          name="period"
          label="Zeitraum"
          value={period}
          options={PERIODS}
          icon="calendar"
        />
        <FacetSearch value={str("q")} />
      </Facets>
      <ActiveFilters
        params={sp}
        labels={{ q: "Suche", status: "Status", objective: "Ziel", period: "Zeitraum" }}
      />

      {/* Ein Konto ohne Freigabe darf die Übersicht nicht leeren – Fehler werden oben angezeigt. */}
      {errors.map((e, i) => (
        <Alert key={i} status="danger">
          <Alert.Content>
            <Alert.Title>Kampagnen teilweise nicht verfügbar</Alert.Title>
            <Alert.Description>{e.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ))}

      {/* Table bringt die Karte selbst mit: graue Kopfzeile, weiße Zeilenfläche. */}
      <Table>
        <Table.Content aria-label="Kampagnen">
          <Table.Header>
            <Table.Column isRowHeader>Kampagne</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column>Ziel</Table.Column>
            <Table.Column>Tagesbudget</Table.Column>
            <Table.Column>Ausgaben</Table.Column>
            <Table.Column>Impr.</Table.Column>
            <Table.Column>CPM</Table.Column>
            <Table.Column>Kosten/Ergebnis</Table.Column>
            <Table.Column>Gestartet</Table.Column>
          </Table.Header>
          {/* Eine leere Tabelle ohne Text sieht aus wie eine kaputte – meist ist
              nur der Zeitraum zu eng oder ein Filter zu scharf gesetzt. */}
          <TableBody empty="Keine Kampagnen in diesem Zeitraum. Wähle einen längeren Zeitraum oder entferne einen Filter.">
            {rows.map((c) => (
              <Table.Row key={c.id} id={c.id}>
                {/* Zweizeilig wie in der Vorlage: der Kunde steht unter dem Namen,
                    statt eine eigene Spalte zu belegen. */}
                <Table.Cell>
                  <Link href={`/campaigns/${c.id}`} className="block hover:underline">
                    <span className="text-ink-900 block font-medium">{c.name}</span>
                    {!scope && <span className="text-ink-500 block text-xs">{c.customerName}</span>}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <StatusSwitch id={c.id} name={c.name} status={c.status} />
                </Table.Cell>
                <Table.Cell className="text-ink-500 text-xs">{label(c.objective)}</Table.Cell>
                <Table.Cell>
                  <BudgetField
                    id={c.id}
                    cents={c.daily_budget !== undefined ? Number(c.daily_budget) : undefined}
                  />
                </Table.Cell>
                {/* Number(...) statt "|| undefined": ein echtes €0-Spend ist kein Datenausfall. */}
                <Table.Cell className="tabular-nums">{money(Number(c.insights?.spend))}</Table.Cell>
                <Table.Cell className="tabular-nums">{c.insights?.impressions ?? "—"}</Table.Cell>
                <Table.Cell className="tabular-nums">{money(Number(c.insights?.cpm))}</Table.Cell>
                <Table.Cell className="tabular-nums">{money(costPerResult(c.insights))}</Table.Cell>
                <Table.Cell className="text-ink-500 text-xs">
                  {c.start_time ? new Date(c.start_time).toLocaleDateString("en-GB") : "—"}
                </Table.Cell>
              </Table.Row>
            ))}
          </TableBody>
        </Table.Content>
      </Table>
    </div>
  );
}
