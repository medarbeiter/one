import Link from "next/link";
import { Alert, Card, Table } from "@heroui/react";
import { costPerResult, listCampaigns, type Period } from "@/lib/campaigns";
import { findCustomer, listCustomers } from "@/lib/customers";
import { ActiveFilters, FacetSearch, FacetSelect, Facets } from "@/app/shell/facets";
import { StatusSwitch, BudgetField } from "./row-controls";

const PERIODS: [string, string][] = [
  ["today", "Today"],
  ["last_7d", "Last 7 days"],
  ["last_30d", "Last 30 days"],
  ["maximum", "Lifetime"],
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
    (o) => [o, o] as [string, string],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-ink-900 text-2xl">Campaigns</h1>
        <Link
          href={`/campaigns/new${str("customer") ? `?customer=${str("customer")}` : ""}`}
          className="bg-gold-500 text-ink-900 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          New campaign
        </Link>
      </div>

      <Facets customer={str("customer")}>
        <FacetSearch value={str("q")} />
        <FacetSelect
          name="status"
          label="Status"
          value={str("status")}
          options={[
            ["ACTIVE", "Active"],
            ["PAUSED", "Paused"],
            ["ARCHIVED", "Archived"],
          ]}
        />
        <FacetSelect name="objective" label="Objective" value={str("objective")} options={objectives} />
        <FacetSelect name="period" label="Period" value={period} options={PERIODS} />
      </Facets>
      <ActiveFilters
        params={sp}
        labels={{ q: "Search", status: "Status", objective: "Objective", period: "Period" }}
      />

      {/* Ein Konto ohne Freigabe darf die Übersicht nicht leeren – Fehler werden oben angezeigt. */}
      {errors.map((e, i) => (
        <Alert key={i} status="danger">
          <Alert.Content>
            <Alert.Title>Campaigns partly unavailable</Alert.Title>
            <Alert.Description>{e.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ))}

      <Card>
        <Card.Content>
          <Table>
            <Table.Content aria-label="Campaigns">
              <Table.Header>
                <Table.Column isRowHeader>Name</Table.Column>
                {!scope && <Table.Column>Customer</Table.Column>}
                <Table.Column>Status</Table.Column>
                <Table.Column>Objective</Table.Column>
                <Table.Column>Daily budget</Table.Column>
                <Table.Column>Spend</Table.Column>
                <Table.Column>Impr.</Table.Column>
                <Table.Column>CPM</Table.Column>
                <Table.Column>Cost/result</Table.Column>
                <Table.Column>Started</Table.Column>
              </Table.Header>
              <Table.Body>
                {rows.map((c) => (
                  <Table.Row key={c.id} id={c.id}>
                    <Table.Cell>
                      <Link href={`/campaigns/${c.id}`} className="text-gold-700 underline">
                        {c.name}
                      </Link>
                    </Table.Cell>
                    {!scope && <Table.Cell>{c.customerName}</Table.Cell>}
                    <Table.Cell>
                      <StatusSwitch id={c.id} name={c.name} status={c.status} />
                    </Table.Cell>
                    <Table.Cell className="text-ink-500 text-xs">{c.objective}</Table.Cell>
                    <Table.Cell>
                      <BudgetField id={c.id} cents={Number(c.daily_budget ?? 0)} />
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {money(Number(c.insights?.spend) || undefined)}
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {c.insights?.impressions ?? "—"}
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {money(Number(c.insights?.cpm) || undefined)}
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {money(costPerResult(c.insights))}
                    </Table.Cell>
                    <Table.Cell className="text-ink-500 text-xs">
                      {c.start_time ? new Date(c.start_time).toLocaleDateString("en-GB") : "—"}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table>
        </Card.Content>
      </Card>
    </div>
  );
}
