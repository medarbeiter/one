import * as UI from "@/app/shell/ui";
import Link from "next/link";
import { Banner, Card, Table } from "@/app/shell/ui";
import { costPerResult, listCampaigns } from "@/lib/campaigns";
import { findCustomer, listCustomers } from "@/lib/customers";
import { label } from "@/lib/labels";
import { ActiveFilters, FacetSearch, FacetSelect, Facets } from "@/app/shell/facets";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";
import { TableBody } from "@/app/shell/table-body";
import { PeriodNav, readPeriod } from "./period-nav";
import { StatusSwitch, BudgetField } from "./row-controls";

// Fehlende Kennzahlen sind "—", nicht "undefined"/"NaN"/"€NaN" – viele Kunden
// tragen in einem Zeitraum schlicht keine Kampagnen bei.
const money = (n?: number, currency = "EUR") =>
  n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = readPeriod(sp);

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

  // Die eine Zahl des Zeitraums: was er gekostet hat. Der Zähler, der bisher
  // als Badge neben der Überschrift stand, rückt in die Standzeile – er
  // beschreibt die Liste, aber die Frage an einen Zeitraum ist das Geld.
  // In Euro wie die ganze Tabelle darunter (siehe `money`).
  const ausgaben = rows.reduce((summe, c) => summe + Number(c.insights?.spend ?? 0), 0);
  const aktiv = rows.filter((c) => c.status === "ACTIVE").length;

  return (
    <>
      <Blattkopf
        titel="Kampagnen"
        meaning="campaign"
        figur={money(ausgaben)}
        figurEinheit="Ausgaben"
        stand={
          rows.length === 0
            ? "Keine Kampagne in diesem Zeitraum."
            : `${rows.length} ${rows.length === 1 ? "Kampagne" : "Kampagnen"} · ${aktiv} aktiv`
        }
        nav={<PeriodNav route="/campaigns" period={period} params={sp} />}
      />

      <Blatt>
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
          {/* Der Zeitraum steht nicht mehr hier, sondern als Reiter im Kopf
              (period-nav.tsx) – er ist die Ansicht, kein Filter. Als verstecktes
              Feld bleibt er trotzdem in diesem Formular: ein GET-Formular
              schreibt beim Abschicken die *ganze* Query neu, und ohne diese
              Zeile fiele die Wahl beim ersten Filtern auf die Vorgabe zurück. */}
          <input type="hidden" name="period" value={period} />
          <FacetSearch value={str("q")} />
        </Facets>
        <ActiveFilters params={sp} labels={{ q: "Suche", status: "Status", objective: "Ziel" }} />

        {/* Ein Konto ohne Freigabe darf die Übersicht nicht leeren – Fehler werden oben angezeigt. */}
        {errors.map((e, i) => (
          <Banner
            key={i}
            status="error"
            title="Kampagnen teilweise nicht verfügbar"
            description={e.message}
          />
        ))}

        {/* Astryx' Table ist selbst das <table> und bringt keine Fläche mit – die
            Karte, die HeroUIs Table noch selbst mitbrachte (graue Kopfzeile,
            weiße Zeilenfläche), steht deshalb hier: ohne Innenabstand, damit die
            Kopfzeile bündig mit dem Kartenrand abschließt. */}
        <Card elevation="low" padding={0}>
          <Table aria-label="Kampagnen">
            <UI.TableHeader>
              <UI.TableRow isHeaderRow>
                <UI.TableColumn>Kampagne</UI.TableColumn>
                <UI.TableColumn>Status</UI.TableColumn>
                <UI.TableColumn>Ziel</UI.TableColumn>
                <UI.TableColumn>Tagesbudget</UI.TableColumn>
                <UI.TableColumn>Ausgaben</UI.TableColumn>
                <UI.TableColumn>Impr.</UI.TableColumn>
                <UI.TableColumn>CPM</UI.TableColumn>
                <UI.TableColumn>Kosten/Ergebnis</UI.TableColumn>
                <UI.TableColumn>Gestartet</UI.TableColumn>
              </UI.TableRow>
            </UI.TableHeader>
            {/* Eine leere Tabelle ohne Text sieht aus wie eine kaputte – meist ist
                nur der Zeitraum zu eng oder ein Filter zu scharf gesetzt.
                `columns` muss der Zahl der Kopfzellen oben entsprechen – der
                Leertext spannt sich über sie, und niemand merkt eine Abweichung. */}
            <TableBody
              columns={9}
              empty="Keine Kampagnen in diesem Zeitraum. Wähle einen längeren Zeitraum oder entferne einen Filter."
            >
              {rows.map((c) => (
                <UI.TableRow key={c.id} id={c.id}>
                  {/* Zweizeilig wie in der Vorlage: der Kunde steht unter dem Namen,
                      statt eine eigene Spalte zu belegen. scope="row" macht diese
                      Zelle zum Zeilenkopf: ohne sie sagt ein Screenreader in den
                      acht Zellen rechts nicht mehr, zu welcher Kampagne sie gehören. */}
                  <UI.TableCell scope="row">
                    <Link href={`/campaigns/${c.id}`} className="block hover:underline">
                      <span className="text-ink-900 block font-medium">{c.name}</span>
                      {!scope && <span className="text-ink-500 block text-xs">{c.customerName}</span>}
                    </Link>
                  </UI.TableCell>
                  <UI.TableCell>
                    <StatusSwitch id={c.id} name={c.name} status={c.status} />
                  </UI.TableCell>
                  <UI.TableCell className="text-ink-500 text-xs">{label(c.objective)}</UI.TableCell>
                  <UI.TableCell>
                    <BudgetField
                      id={c.id}
                      cents={c.daily_budget !== undefined ? Number(c.daily_budget) : undefined}
                    />
                  </UI.TableCell>
                  {/* Number(...) statt "|| undefined": ein echtes €0-Spend ist kein Datenausfall. */}
                  <UI.TableCell className="tabular-nums">{money(Number(c.insights?.spend))}</UI.TableCell>
                  <UI.TableCell className="tabular-nums">{c.insights?.impressions ?? "—"}</UI.TableCell>
                  <UI.TableCell className="tabular-nums">{money(Number(c.insights?.cpm))}</UI.TableCell>
                  <UI.TableCell className="tabular-nums">{money(costPerResult(c.insights))}</UI.TableCell>
                  <UI.TableCell className="text-ink-500 text-xs">
                    {c.start_time ? new Date(c.start_time).toLocaleDateString("en-GB") : "—"}
                  </UI.TableCell>
                </UI.TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Blatt>
    </>
  );
}
