import Link from "next/link";
import * as UI from "@/app/shell/ui";
import { Badge, Banner, Card } from "@/app/shell/ui";
import { listCampaigns, results, sumInsights } from "@/lib/campaigns";
import { befundeAlle, stufe } from "@/lib/befund";
import { findCustomer, listCustomers } from "@/lib/customers";
import { label } from "@/lib/labels";
import { ActiveFilters, FacetSearch, FacetSelect, Facets } from "@/app/shell/facets";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";
import { PeriodNav, readPeriod } from "./period-nav";
import { CampaignTable } from "./campaign-table";
import { Kacheln } from "./kacheln";
import { money } from "./kennzahlen";

/** Der Befund-Filter in der Adresse: was zu tun ist, nur das Rote, oder was läuft. */
const BEFUND_FILTER: [string, string][] = [
  ["handeln", "Handlungsbedarf"],
  ["rot", "Nur Kritisch"],
  ["ok", "Läuft"],
];

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = readPeriod(sp);

  const { customers } = await listCustomers();
  const scope = findCustomer(customers, str("customer"));
  const q = str("q");
  const { campaigns, errors } = await listCampaigns(scope ? [scope] : customers, q);

  // Der Maßstab („teurer als der Schnitt“) ist die ganze Liste, nicht der
  // gefilterte Rest – sonst verschöbe jeder Filter das Urteil.
  const befunde = befundeAlle(campaigns, period);
  const stufeVon = (c: (typeof campaigns)[number]) => stufe(c, befunde.get(c.id) ?? []);

  const rows = campaigns.filter((c) => {
    const s = stufeVon(c);
    const f = str("befund");
    return (
      (!str("status") || c.status === str("status")) &&
      (!str("objective") || c.objective === str("objective")) &&
      (!f || (f === "handeln" ? s === "rot" || s === "gelb" : s === f))
    );
  });

  const objectives = [...new Set(campaigns.map((c) => c.objective))].map(
    (o) => [o, label(o)] as [string, string],
  );

  // Die eine Zahl des Zeitraums: was er gekostet hat. Alles andere steht in
  // den Kacheln darunter – die Liste als eine Kampagne gerechnet.
  const summe = sumInsights(rows.map((c) => c.insights?.[period]));
  const ausgaben = Number(summe.spend);
  const leads = results(summe) ?? 0;
  const aktiv = rows.filter((c) => c.status === "ACTIVE").length;
  const zaehler = { rot: 0, gelb: 0, ok: 0 };
  for (const c of rows) {
    const s = stufeVon(c);
    if (s) zaehler[s]++;
  }
  const handeln = zaehler.rot + zaehler.gelb;

  // Ein Zähler ist ein Link auf seinen Filter – die Adresse nimmt alles mit, was schon drin steht.
  const filterHref = (befund: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "befund") next.set(k, v);
    if (befund) next.set("befund", befund);
    return `/campaigns?${next.toString()}`;
  };

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
            : `${rows.length} ${rows.length === 1 ? "Kampagne" : "Kampagnen"} · ${aktiv} aktiv · ${leads} Leads · ${money(leads ? ausgaben / leads : undefined)} je Lead` +
              (handeln ? ` · ${handeln} mit Handlungsbedarf` : "")
        }
        nav={<PeriodNav route="/campaigns" period={period} params={sp} />}
      />

      <Blatt>
        <Facets customer={str("customer")}>
          <FacetSelect name="befund" label="Befund" value={str("befund")} options={BEFUND_FILTER} icon="warning" />
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
        <ActiveFilters params={sp} labels={{ q: "Suche", status: "Status", objective: "Ziel", befund: "Befund" }} />

        {/* Ein Konto ohne Freigabe darf die Übersicht nicht leeren – Fehler werden oben angezeigt. */}
        {errors.map((e, i) => (
          <Banner
            key={i}
            status="error"
            title="Kampagnen teilweise nicht verfügbar"
            description={e.message}
          />
        ))}

        {/* Die Liste als Ganzes: erst der Stand der aktiven Kampagnen (jede
            Marke ist ihr Filter), dann die Kennzahlen aller Zeilen zusammen. */}
        <Card elevation="low">
          <UI.CardContent className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-ink-500">Aktive Kampagnen</span>
              {(
                [
                  ["rot", "error", "kritisch"],
                  ["gelb", "warning", "zu prüfen"],
                  ["ok", "success", "laufen"],
                ] as const
              ).map(([s, variant, text]) => (
                <Link
                  key={s}
                  href={filterHref(str("befund") === s ? "" : s)}
                  aria-current={str("befund") === s ? "page" : undefined}
                  className="inline-flex items-center gap-1.5 rounded-full hover:underline aria-[current]:underline"
                >
                  <Badge variant={variant} label={String(zaehler[s])} />
                  <span>{text}</span>
                </Link>
              ))}
              <span className="text-ink-500 text-xs">
                Kritisch: Geld ohne Leads. Prüfen: teurer als der Schnitt, schwaches Creative, müde Zielgruppe, liefert nicht aus.
              </span>
            </div>
            <Kacheln insights={summe} />
          </UI.CardContent>
        </Card>

        {/* Astryx' Table ist selbst das <table> und bringt keine Fläche mit – die
            Karte, die HeroUIs Table noch selbst mitbrachte (graue Kopfzeile,
            weiße Zeilenfläche), steht deshalb hier: ohne Innenabstand, damit die
            Kopfzeile bündig mit dem Kartenrand abschließt. */}
        <Card elevation="low" padding={0}>
          <CampaignTable rows={rows} befunde={Object.fromEntries(befunde)} period={period} scoped={Boolean(scope)} />
        </Card>
      </Blatt>
    </>
  );
}
