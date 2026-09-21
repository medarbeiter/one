import * as UI from "@/app/shell/ui";
import { Badge, Button, Card, Collapsible, CollapsibleGroup } from "@/app/shell/ui";
import { Sign } from "@/theme/icons";
import { getCampaign, PERIODS, results } from "@/lib/campaigns";
import { label } from "@/lib/labels";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";
import { PeriodNav, readPeriod } from "../period-nav";
import { Balken } from "../balken";
import { kennzahl, money, zahl } from "../kennzahlen";
import { StatusSwitch, BudgetField } from "../row-controls";
import { Kacheln } from "./kacheln";
import { Anzeigen } from "./anzeigen";

const marke = (status: string) => (
  <Badge variant={status === "ACTIVE" ? "success" : "neutral"} label={label(status)} />
);

export default async function CampaignPage({ params, searchParams }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const c = await getCampaign(id);
  // Ohne Zeitraum in der Adresse (Suche, Kundenseite) den ersten mit Ausgaben:
  // eine alte, pausierte Kampagne zeigte unter „Letzte 7 Tage“ sonst nur
  // Striche – und das sieht aus, als wäre nichts geladen worden.
  const period =
    typeof sp.period === "string"
      ? readPeriod(sp)
      : (PERIODS.find((p) => Number(c.insights?.[p]?.spend) > 0) ?? "maximum");
  const insights = c.insights?.[period];
  const leads = results(insights);
  const cpl = kennzahl("cpl").wert(insights);

  return (
    <>
      {/* Die eine Zahl dieser Kampagne im gewählten Zeitraum: was sie gekostet
          hat. Ziel und Status stehen als Marken daneben – sie beschreiben die
          Kampagne, nicht den Zeitraum, und gehören darum nicht in die Zahl. */}
      <Blattkopf
        titel={c.name}
        meaning="campaign"
        figur={money(Number(insights?.spend))}
        figurEinheit="Ausgaben"
        stand={`${leads ?? 0} Leads · ${money(cpl)} je Lead · ${c.customerName ?? ""}`.replace(/ · $/, "")}
        marken={
          <>
            {marke(c.status)}
            <Badge variant="neutral" label={label(c.objective)} />
          </>
        }
        // Beide führen in den Assistenten: Duplizieren baut aus dieser Kampagne
        // einen neuen Vorschlag, Bearbeiten ändert sie selbst (lib/seed.ts).
        werkzeuge={
          <>
            <Button variant="secondary" size="sm" href={`/campaigns/new?from=${id}`} icon={<Sign meaning="add" />} label="Duplizieren" />
            <Button variant="secondary" size="sm" href={`/campaigns/new?edit=${id}`} label="Bearbeiten" />
          </>
        }
        nav={<PeriodNav route={`/campaigns/${id}`} period={period} params={sp} />}
      />

      <Blatt>
        {/* Status und Budget direkt hier – mit denselben Rückfragen wie in der Liste. */}
        <Card elevation="low">
          <UI.CardContent className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-6">
              <StatusSwitch id={c.id} name={c.name} status={c.status} />
              <span className="flex items-center gap-2 text-sm">
                <span className="text-ink-500">Tagesbudget</span>
                <BudgetField id={c.id} name={c.name} cents={c.daily_budget !== undefined ? Number(c.daily_budget) : undefined} />
              </span>
              {c.start_time && (
                <span className="text-ink-500 text-sm">
                  Gestartet {new Date(c.start_time).toLocaleDateString("de-DE")}
                </span>
              )}
            </div>
            <Kacheln insights={insights} />
          </UI.CardContent>
        </Card>

        {/* Der Verlauf ist immer der letzte Monat, egal welcher Reiter oben
            gewählt ist – ein Tag hätte einen Balken, „Gesamt“ Hunderte. */}
        <Card elevation="low">
          <UI.CardContent className="flex flex-col gap-4">
            <span className="text-ink-500 text-xs">Letzte 30 Tage, je Tag</span>
            <div className="flex flex-col gap-6 md:flex-row">
              <Balken titel="Ausgaben" werte={c.tage.map((t) => ({ tag: t.date_start, wert: Number(t.spend ?? 0) }))} format={money} />
              <Balken titel="Leads" werte={c.tage.map((t) => ({ tag: t.date_start, wert: results(t) ?? 0 }))} format={zahl} />
            </div>
          </UI.CardContent>
        </Card>

        {/* Astryx' Collapsible ist ein Bauteil statt einer Familie: der Kopf ist
            die `trigger`-Prop, der Körper sind die Kinder. Den Pfeil und die
            Aria-Verknüpfung bringt es selbst mit. */}
        <CollapsibleGroup type="multiple">
          {c.adsets.map((s) => (
            <Collapsible
              key={s.id}
              value={s.id}
              trigger={
                <span className="flex w-full items-center gap-3 text-left">
                  <span className="flex-1">{s.name}</span>
                  <span className="text-ink-500 text-xs tabular-nums">
                    {zahl(results(s.insights[period]))} Leads · {money(kennzahl("cpl").wert(s.insights[period]))} je Lead
                  </span>
                  {marke(s.status)}
                </span>
              }
            >
              <div className="space-y-4 pb-4">
                <Kacheln insights={s.insights[period]} kompakt />
                <div className="text-ink-500 text-xs">
                  {label(s.optimization_goal ?? "")} · {label(s.billing_event ?? "")} · täglich{" "}
                  {money(Number(s.daily_budget) / 100)}
                </div>
                <Anzeigen
                  campaignId={c.id}
                  adAccount={c.account_id ? `act_${c.account_id}` : undefined}
                  adsetId={s.id}
                  ads={s.ads}
                  period={period}
                />
              </div>
            </Collapsible>
          ))}
        </CollapsibleGroup>
      </Blatt>
    </>
  );
}
