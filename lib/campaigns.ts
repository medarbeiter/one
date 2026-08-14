/**
 * Kampagnen über alle Werbekonten eines Scopes – Konten werden gebündelt
 * abgefragt, damit "Alle Kunden" nicht 18 Einzelaufrufe bedeutet.
 */
import { batch, graph, GraphError } from "./graph";
import type { Customer } from "./customers";
import { uploadImage, uploadVideo, videoThumbnail } from "./uploads";

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
  /** Erster Eigentümer des Kontos; bei geteiltem Konto nennt customerName alle. */
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
  // Ein Sub-Request pro Werbekonto – nicht pro Kunde: ein Konto kann mehreren
  // Kunden gehören (MedArbeiter zahlt über dasselbe Konto auch für "Jobs -
  // MedArbeiter"). Je Kunde gefragt, käme dieselbe Kampagne doppelt zurück.
  const owners = new Map<string, Customer[]>();
  for (const c of customers)
    for (const a of c.adAccounts) owners.set(a.id, [...(owners.get(a.id) ?? []), c]);

  const accounts = [...owners.keys()];
  const settled = await batch<{ data: Campaign[] }>(
    accounts.map((acct) => ({
      relative_url: `${acct}/campaigns?fields=${encodeURIComponent(FIELDS(period))}&limit=100`,
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
    const cs = owners.get(accounts[i])!;
    for (const raw of r.value.data ?? [])
      campaigns.push({
        ...raw,
        insights: (raw as any).insights?.data?.[0],
        customerId: cs[0].id,
        customerName: cs.map((c) => c.name).join(", "),
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

/* ---------- Kampagne → Anzeigengruppe → Anzeigen ---------- */

export type LaunchInput = {
  adAccount: string;
  pageId: string;
  name: string;
  objective: string;
  dailyBudgetCents: number;
  optimizationGoal: string;
  billingEvent: string;
  specialAdCategories: string[];
  countries: string[];
  ageMin: number;
  ageMax: number;
  link: string;
  message: string;
  headline: string;
  callToAction: string;
  files: File[];
};

export async function launch(input: LaunchInput) {
  const acct = input.adAccount;
  // Employment/Housing/Credit: Meta verbietet Alters- und Geschlechts-Targeting.
  const restricted = input.specialAdCategories.some((c) =>
    ["EMPLOYMENT", "HOUSING", "CREDIT"].includes(c),
  );

  const campaign = await graph<{ id: string }>(`${acct}/campaigns`, {
    method: "POST",
    params: {
      name: input.name,
      objective: input.objective,
      status: "PAUSED",
      special_ad_categories: input.specialAdCategories,
      ...(restricted ? { special_ad_category_country: input.countries } : {}),
    },
  });

  const adset = await graph<{ id: string }>(`${acct}/adsets`, {
    method: "POST",
    params: {
      name: `${input.name} – Ad set`,
      campaign_id: campaign.id,
      daily_budget: input.dailyBudgetCents,
      billing_event: input.billingEvent,
      optimization_goal: input.optimizationGoal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      status: "PAUSED",
      targeting: {
        geo_locations: { countries: input.countries },
        ...(restricted ? {} : { age_min: input.ageMin, age_max: input.ageMax }),
      },
    },
  });

  // ponytail: eine Anzeige pro Datei. Placement-Asset-Customization (ein Creative,
  // mehrere Formate) erst, wenn Feed/Reels wirklich getrennt optimiert werden sollen.
  const ads: string[] = [];
  for (const file of input.files) {
    const isVideo = file.type.startsWith("video/");
    const story = isVideo
      ? await videoStory(file, input)
      : { image_hash: await uploadImage(file, acct), ...linkFields(input) };

    const creative = await graph<{ id: string }>(`${acct}/adcreatives`, {
      method: "POST",
      params: {
        name: `${input.name} – ${file.name}`,
        object_story_spec: {
          page_id: input.pageId,
          [isVideo ? "video_data" : "link_data"]: story,
        },
        degrees_of_freedom_spec: {
          creative_features_spec: {
            standard_enhancements: { enroll_status: "OPT_OUT" },
          },
        },
      },
    });

    const ad = await graph<{ id: string }>(`${acct}/ads`, {
      method: "POST",
      params: {
        name: `${input.name} – ${file.name}`,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      },
    });
    ads.push(ad.id);
  }

  return { campaignId: campaign.id, adsetId: adset.id, adIds: ads };
}

function linkFields(i: LaunchInput) {
  return {
    link: i.link,
    message: i.message,
    name: i.headline,
    call_to_action: { type: i.callToAction, value: { link: i.link } },
  };
}

async function videoStory(file: File, i: LaunchInput) {
  const videoId = await uploadVideo(file, i.adAccount);
  return {
    video_id: videoId,
    image_url: await videoThumbnail(videoId),
    message: i.message,
    title: i.headline,
    call_to_action: { type: i.callToAction, value: { link: i.link } },
  };
}
