import * as UI from "@/app/shell/ui";
import { Badge, Card, Collapsible, CollapsibleGroup, EmptyState } from "@/app/shell/ui";
import { costPerResult, getCampaign, results, type Insights, type Period } from "@/lib/campaigns";

const money = (n?: number) =>
  n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(n);

function Metrics({ insights }: { insights?: Insights }) {
  const cells: [string, string][] = [
    ["Ausgaben", money(Number(insights?.spend))],
    ["Impressionen", insights?.impressions ?? "—"],
    ["CPM", money(Number(insights?.cpm))],
    ["Ergebnisse", String(results(insights) ?? "—")],
    ["Kosten/Ergebnis", money(costPerResult(insights))],
  ];
  return (
    <dl className="flex flex-wrap gap-6 text-sm">
      {cells.map(([k, v]) => (
        <div key={k}>
          <dt className="text-ink-500 text-xs">{k}</dt>
          <dd className="font-display text-ink-900 tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function CampaignPage({ params, searchParams }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const period = (typeof sp.period === "string" ? sp.period : "last_7d") as Period;
  const c = await getCampaign(id, period);
  const insights = (c as any).insights?.data?.[0] as Insights | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <UI.TypographyHeading level={1} className="font-display text-xl">
          {c.name}
        </UI.TypographyHeading>
        <Badge variant={c.status === "ACTIVE" ? "success" : "neutral"} label={c.status} />
        <span className="text-ink-500 text-xs">{c.objective}</span>
      </div>

      <Card elevation="low">
        <UI.CardContent className="flex flex-col gap-4">
          <Metrics insights={insights} />
        </UI.CardContent>
      </Card>

      {/* Astryx' Collapsible ist ein Bauteil statt einer Familie: der Kopf ist
          die `trigger`-Prop, der Körper sind die Kinder. Den Pfeil und die
          Aria-Verknüpfung bringt es selbst mit. */}
      <CollapsibleGroup type="multiple">
        {(c.adsets?.data ?? []).map((s: any) => (
          <Collapsible
            key={s.id}
            value={s.id}
            trigger={
              <span className="flex w-full items-center gap-3 text-left">
                <span className="flex-1">{s.name}</span>
                <Badge variant={s.status === "ACTIVE" ? "success" : "neutral"} label={s.status} />
              </span>
            }
          >
            <div className="space-y-4 pb-4">
              <Metrics insights={s.insights?.data?.[0]} />
              <div className="text-ink-500 text-xs">
                {s.optimization_goal} · {s.billing_event} · täglich{" "}
                {money(Number(s.daily_budget) / 100)}
              </div>
              {s.ads?.data?.length ? (
                <ul className="space-y-2">
                  {s.ads.data.map((ad: any) => (
                    <li key={ad.id}>
                      {/* Jede Anzeige ist eine Karte – dieselbe Fläche, die auch
                          die Kennzahlen darüber trägt. */}
                      <Card elevation="low" variant="muted">
                        <UI.CardContent className="flex items-start gap-3">
                          {ad.creative?.thumbnail_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ad.creative.thumbnail_url} alt="" className="size-16 rounded-lg object-cover" />
                          )}
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm">{ad.name}</span>
                              <Badge
                                variant={ad.status === "ACTIVE" ? "success" : "neutral"}
                                label={ad.status}
                              />
                            </div>
                            <Metrics insights={ad.insights?.data?.[0]} />
                          </div>
                        </UI.CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Diese Anzeigengruppe hat noch keine Anzeigen." isCompact />
              )}
            </div>
          </Collapsible>
        ))}
      </CollapsibleGroup>
    </div>
  );
}
