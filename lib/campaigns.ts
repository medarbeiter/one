/**
 * Kampagnen über alle Werbekonten eines Scopes – Konten werden gebündelt
 * abgefragt, damit "Alle Kunden" nicht 18 Einzelaufrufe bedeutet.
 */
import { batch, graph, GraphError, meta } from "./graph";
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

/* ---------- Uploads ---------- */

export async function uploadImage(
  file: File,
  acct = meta.adAccount,
): Promise<string> {
  const fd = new FormData();
  fd.append(file.name, file);
  const r = await graph<{ images: Record<string, { hash: string }> }>(
    `${acct}/adimages`,
    { method: "POST", body: fd },
  );
  return Object.values(r.images)[0].hash;
}

export async function uploadVideo(
  file: File,
  acct = meta.adAccount,
): Promise<string> {
  const fd = new FormData();
  fd.append("source", file);
  const { id } = await graph<{ id: string }>(`${acct}/advideos`, {
    method: "POST",
    body: fd,
  });
  await waitForVideo(id);
  return id;
}

// ponytail: 5s-Polling, Decke bei ~5 Min. Erst auf Job-Queue umbauen, wenn Videos
// regelmäßig länger encodieren oder mehrere parallel hochgeladen werden.
async function waitForVideo(id: string, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const { status } = await graph<{ status: { video_status: string } }>(id, {
      params: { fields: "status" },
    });
    if (status?.video_status === "ready") return;
    if (status?.video_status === "error")
      throw new Error(`Video ${id}: processing failed`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Video ${id} still not processed after 5 minutes`);
}

async function videoThumbnail(videoId: string): Promise<string> {
  const { data } = await graph<{
    data: { uri: string; is_preferred: boolean }[];
  }>(`${videoId}/thumbnails`);
  return (data.find((t) => t.is_preferred) ?? data[0]).uri;
}

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
