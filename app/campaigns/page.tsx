import { Banner, Card } from "@/app/shell/ui";
import { listCampaigns, results } from "@/lib/campaigns";
import { findCustomer, listCustomers } from "@/lib/customers";
import { label } from "@/lib/labels";
import { ActiveFilters, FacetSearch, FacetSelect, Facets } from "@/app/shell/facets";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";
import { PeriodNav, readPeriod } from "./period-nav";
import { CampaignTable } from "./campaign-table";
import { money } from "./kennzahlen";

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = readPeriod(sp);

  const { customers } = await listCustomers();
  const scope = findCustomer(customers, str("customer"));
  const q = str("q");
  const { campaigns, errors } = await listCampaigns(scope ? [scope] : customers, q);

  const rows = campaigns.filter(
    (c) =>
      (!str("status") || c.status === str("status")) &&
      (!str("objective") || c.objective === str("objective")),
  );

  const objectives = [...new Set(campaigns.map((c) => c.objective))].map(
    (o) => [o, label(o)] as [string, string],
  );

  // Die eine Zahl des Zeitraums: was er gekostet hat. Der Zähler, der bisher
  // als Badge neben der Überschrift stand, rückt in die Standzeile – er
  // beschreibt die Liste, aber die Frage an einen Zeitraum ist das Geld.
  // In Euro wie die ganze Tabelle darunter (siehe `money`).
  const ausgaben = rows.reduce((summe, c) => summe + Number(c.insights?.[period]?.spend ?? 0), 0);
  const leads = rows.reduce((summe, c) => summe + (results(c.insights?.[period]) ?? 0), 0);
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
            : `${rows.length} ${rows.length === 1 ? "Kampagne" : "Kampagnen"} · ${aktiv} aktiv · ${leads} Leads · ${money(leads ? ausgaben / leads : undefined)} je Lead`
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
          <CampaignTable rows={rows} period={period} scoped={Boolean(scope)} />
        </Card>
      </Blatt>
    </>
  );
}
