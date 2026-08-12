import { Card, Chip, Disclosure, DisclosureGroup } from "@heroui/react";
import { costPerResult, getCampaign, results, type Insights, type Period } from "@/lib/campaigns";

const money = (n?: number) =>
  n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(n);

function Metrics({ insights }: { insights?: Insights }) {
  const cells: [string, string][] = [
    ["Spend", money(Number(insights?.spend))],
    ["Impressions", insights?.impressions ?? "—"],
    ["CPM", money(Number(insights?.cpm))],
    ["Results", String(results(insights) ?? "—")],
    ["Cost/result", money(costPerResult(insights))],
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
        <h1 className="font-display text-ink-900 text-2xl">{c.name}</h1>
        <Chip size="sm" color={c.status === "ACTIVE" ? "success" : "default"}>
          {c.status}
        </Chip>
        <span className="text-ink-500 text-xs">{c.objective}</span>
      </div>

      <Card>
        <Card.Content>
          <Metrics insights={insights} />
        </Card.Content>
      </Card>

      <DisclosureGroup allowsMultipleExpanded>
        {(c.adsets?.data ?? []).map((s: any) => (
          <Disclosure key={s.id} id={s.id}>
            <Disclosure.Heading>
              <Disclosure.Trigger className="flex w-full items-center gap-3 py-3 text-left">
                <Disclosure.Indicator />
                <span className="flex-1">{s.name}</span>
                <Chip size="sm" color={s.status === "ACTIVE" ? "success" : "default"}>
                  {s.status}
                </Chip>
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="space-y-4 pb-4">
                <Metrics insights={s.insights?.data?.[0]} />
                <div className="text-ink-500 text-xs">
                  {s.optimization_goal} · {s.billing_event} · daily{" "}
                  {money(Number(s.daily_budget) / 100)}
                </div>
                <ul className="space-y-2">
                  {(s.ads?.data ?? []).map((ad: any) => (
                    <li key={ad.id} className="border-line flex items-start gap-3 rounded-md border p-3">
                      {ad.creative?.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ad.creative.thumbnail_url} alt="" className="size-16 rounded object-cover" />
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm">{ad.name}</span>
                          <Chip size="sm" color={ad.status === "ACTIVE" ? "success" : "default"}>
                            {ad.status}
                          </Chip>
                        </div>
                        <Metrics insights={ad.insights?.data?.[0]} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        ))}
      </DisclosureGroup>
    </div>
  );
}
