/**
 * Kampagnen über alle Werbekonten eines Scopes – Konten werden gebündelt
 * abgefragt, damit "Alle Kunden" nicht 18 Einzelaufrufe bedeutet.
 */
import { batch, graph, GraphError } from "./graph";
import type { Customer } from "./customers";

export type Period = "today" | "last_7d" | "last_30d" | "maximum";

export type Insights = {
  spend?: string;
  impressions?: string;
  cpm?: string;
  actions?: { action_type: string; value: string }[];
};

export type Campaign = {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  start_time?: string;
  customerId?: string;
  customerName?: string;
  insights?: Insights;
};

// Rangfolge, nicht Summe: ein Lead ist auch ein Klick, doppelt zählen wäre falsch.
const RESULT_ACTIONS = [
  "onsite_conversion.lead_grouped",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "landing_page_view",
  "link_click",
  "post_engagement",
];

export function results(insights?: Insights): number | undefined {
  const actions = insights?.actions;
  if (!actions?.length) return undefined;
  for (const type of RESULT_ACTIONS) {
    const hit = actions.find((x) => x.action_type === type);
    if (hit) return Number(hit.value);
  }
  return undefined;
}

export function costPerResult(insights?: Insights): number | undefined {
  const n = results(insights);
  const spend = Number(insights?.spend);
  if (!n || !Number.isFinite(spend) || !insights?.spend) return undefined;
  return spend / n;
}

const FIELDS = (period: Period) =>
  `name,status,objective,daily_budget,start_time,insights.date_preset(${period}){spend,impressions,cpm,actions}`;

export async function listCampaigns(customers: Customer[], period: Period) {
  // Ein Sub-Request pro Werbekonto; die Zuordnung zum Kunden merkt sich der Index.
  const owners = customers.flatMap((c) => c.adAccounts.map((a) => ({ acct: a.id, c })));
  const settled = await batch<{ data: Campaign[] }>(
    owners.map((o) => ({
      relative_url: `${o.acct}/campaigns?fields=${encodeURIComponent(FIELDS(period))}&limit=100`,
    })),
    { revalidate: 60, tags: ["campaigns"] },
  );

  const campaigns: Campaign[] = [];
  const errors: GraphError[] = [];
  settled.forEach((r, i) => {
    if (r.status === "rejected") {
      errors.push(r.reason as GraphError);
      return;
    }
    const { c } = owners[i];
    for (const raw of r.value.data ?? [])
      campaigns.push({
        ...raw,
        insights: (raw as any).insights?.data?.[0],
        customerId: c.id,
        customerName: c.name,
      });
  });

  return { campaigns, errors };
}

export function getCampaign(id: string, period: Period) {
  return graph<Campaign & { adsets?: { data: any[] } }>(id, {
    params: {
      fields: `${FIELDS(period)},adsets{name,status,daily_budget,optimization_goal,billing_event,targeting,insights.date_preset(${period}){spend,impressions,cpm,actions},ads{name,status,creative{thumbnail_url,effective_object_story_id},insights.date_preset(${period}){spend,impressions,cpm,actions}}}`,
    },
    revalidate: 60,
    tags: ["campaigns", `campaign:${id}`],
  });
}

export const setStatus = (id: string, status: "ACTIVE" | "PAUSED") =>
  graph(id, { method: "POST", params: { status } });

export const setDailyBudget = (id: string, cents: number) =>
  graph(id, { method: "POST", params: { daily_budget: cents } });
