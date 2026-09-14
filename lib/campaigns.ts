/**
 * Kampagnen über alle Werbekonten eines Scopes – Konten werden gebündelt
 * abgefragt, damit "Alle Kunden" nicht 18 Einzelaufrufe bedeutet.
 */
import { batch, graph, GraphError } from "./graph";
import type { Customer } from "./customers";
export { adsManagerUrl } from "./labels";
import { uploadImage, uploadVideo, videoThumbnail } from "./uploads";
import { seedFromCampaign, type CampaignSeed } from "./seed";

export type Period = "today" | "last_7d" | "last_30d" | "maximum";
export const PERIODS: Period[] = ["today", "last_7d", "last_30d", "maximum"];
// Graph nimmt keine Ziffern in Aliasnamen („i_last_7d is not a valid name“).
const ALIAS: Record<Period, string> = { today: "i_heute", last_7d: "i_woche", last_30d: "i_monat", maximum: "i_gesamt" };

export type Insights = {
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  cost_per_inline_link_click?: string;
  actions?: { action_type: string; value: string }[];
};

/** Ein Tag der Kampagne – für die Verlaufsbalken auf der Kampagnenseite. */
export type Tag = { date_start: string; spend?: string; actions?: Insights["actions"] };

/** Die Kennzahlen aller vier Zeiträume auf einmal – siehe FIELDS. */
export type PeriodInsights = Partial<Record<Period, Insights>>;

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
  /** Werbekonto (act_…) – für den Sprung in den Ads Manager aus der Liste. */
  adAccount?: string;
  insights?: PeriodInsights;
};

// Ein Ergebnis ist ein Lead – nie ein Klick oder eine Formularansicht. Rangfolge,
// nicht Summe: lead_grouped enthält lead schon, doppelt zählen wäre falsch.
const RESULT_ACTIONS = [
  "onsite_conversion.lead_grouped",
  "lead",
  "offsite_conversion.fb_pixel_lead",
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

const METRICS =
  "spend,impressions,reach,frequency,cpm,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions";

/**
 * Alle vier Zeiträume in EINEM Aufruf, als Aliasse (`insights.date_preset(x).as(i_x)`).
 * Der Zeitraum steht damit nicht mehr in der Anfrage-URL – Nexts Datencache
 * (60 s, Tag „campaigns“) trifft beim Reiterwechsel, statt Meta für jeden
 * Zeitraum neu über alle Konten zu fragen.
 */
const INSIGHTS = PERIODS.map((p) => `insights.date_preset(${p}).as(${ALIAS[p]}){${METRICS}}`).join(",");
const FIELDS = `name,status,objective,daily_budget,start_time,${INSIGHTS}`;

/** Aus den Aliassen der Antwort wieder eine Karte je Zeitraum. */
export function pickInsights(raw: any): PeriodInsights {
  const out: PeriodInsights = {};
  for (const p of PERIODS) {
    const row = raw?.[ALIAS[p]]?.data?.[0];
    if (row) out[p] = row;
  }
  return out;
}

export async function listCampaigns(
  customers: Customer[],
  q?: string,
  // Die Suche braucht nur Namen und Status – ohne die vier Insights-Aggregate
  // antwortet Graph in unter einer Sekunde statt in zehn.
  opts: { lean?: boolean } = {},
) {
  const fields = opts.lean ? "name,status,objective" : FIELDS;
  // Ein Sub-Request pro Werbekonto – nicht pro Kunde: ein Konto kann mehreren
  // Kunden gehören (MedArbeiter zahlt über dasselbe Konto auch für "Jobs -
  // MedArbeiter"). Je Kunde gefragt, käme dieselbe Kampagne doppelt zurück.
  const owners = new Map<string, Customer[]>();
  for (const c of customers)
    for (const a of c.adAccounts) owners.set(a.id, [...(owners.get(a.id) ?? []), c]);

  const accounts = [...owners.keys()];
  // Ohne Suchwort nur die ersten 100 je Konto – ein Konto mit mehr Kampagnen
  // (etwa der gemeinsame Zahler) verliert dann ältere. Mit Suchwort filtert
  // Graph selbst über den ganzen Bestand, nicht nur über die erste Seite.
  const filtering = q
    ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "name", operator: "CONTAIN", value: q }]))}`
    : "";
  const settled = await batch<{ data: Campaign[] }>(
    accounts.map((acct) => ({
      relative_url: `${acct}/campaigns?fields=${encodeURIComponent(fields)}&limit=100${filtering}`,
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
        insights: pickInsights(raw),
        customerId: cs[0].id,
        customerName: cs.map((c) => c.name).join(", "),
        adAccount: accounts[i],
      });
  });

  return { campaigns, errors };
}

/**
 * Die Liste als eine Kampagne: Summen, und daraus die Quoten neu gerechnet –
 * CTR und CPM lassen sich nicht mitteln. Reichweite ist die Summe der
 * Reichweiten und zählt eine Person je Kampagne, nicht je Liste.
 */
export function sumInsights(list: (Insights | undefined)[]): Insights {
  const add = (k: keyof Insights) => list.reduce((s, i) => s + (Number(i?.[k]) || 0), 0);
  const spend = add("spend");
  const impressions = add("impressions");
  const reach = add("reach");
  const clicks = add("inline_link_clicks");
  const leads = list.reduce((s, i) => s + (results(i) ?? 0), 0);
  const q = (n: number) => String(n);
  return {
    spend: q(spend),
    impressions: q(impressions),
    reach: q(reach),
    frequency: reach ? q(impressions / reach) : undefined,
    cpm: impressions ? q((spend / impressions) * 1000) : undefined,
    inline_link_clicks: q(clicks),
    inline_link_click_ctr: impressions ? q((clicks / impressions) * 100) : undefined,
    cost_per_inline_link_click: clicks ? q(spend / clicks) : undefined,
    actions: [{ action_type: "lead", value: q(leads) }],
  };
}

export type AdSet = {
  id: string;
  name: string;
  status: string;
  daily_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  promoted_object?: { page_id?: string };
  insights: PeriodInsights;
  ads: Ad[];
};
export type Creative = {
  id?: string;
  thumbnail_url?: string;
  effective_object_story_id?: string;
  video_id?: string;
  object_story_spec?: any;
  asset_feed_spec?: any;
};
export type Ad = {
  id: string;
  name: string;
  status: string;
  creative?: Creative;
  insights: PeriodInsights;
};
export type CampaignDetail = Campaign & {
  account_id?: string;
  adsets: AdSet[];
  tage: Tag[];
  /** Texte, Formular und Formate je Anzeigengruppe – dieselbe Lesart wie der Assistent. */
  seed: CampaignSeed;
};

/**
 * Vorschauen, wie Meta sie rendert – in drei Reitern, je Platzierung beide
 * Plattformen nebeneinander. Die Größe geht mit in die Anfrage: Meta baut sie
 * in den Einbettungslink ein, ein nachträgliches CSS-Resize ließe den Inhalt
 * bei 320 px stehen und scrollen.
 */
export const PREVIEW_GROUPS = [
  { key: "feed", label: "Feed", formats: [["INSTAGRAM_STANDARD", "Instagram"], ["MOBILE_FEED_STANDARD", "Facebook"]] },
  { key: "reels", label: "Reels", formats: [["INSTAGRAM_REELS", "Instagram"], ["FACEBOOK_REELS_MOBILE", "Facebook"]] },
  { key: "story", label: "Story", formats: [["INSTAGRAM_STORY", "Instagram"]] },
] as const;
export type PreviewFormat = (typeof PREVIEW_GROUPS)[number]["formats"][number][0];

/**
 * Breite × Höhe je Format – gemessen an dem, was Meta tatsächlich zeichnet
 * (2026-09-14, iframe-Dokument im Browser vermessen): die Instagram-Mocks sind
 * ein 320 px breites Telefon, egal wie breit man fragt, und ihre Höhe ist fix
 * (Feed 567, Reels/Story 624). Nur der Facebook-Feed füllt die Breite und
 * wächst mit dem Text. Größer angefragt heißt: Weißraum rechts und unten –
 * und mit Metas `scrolling="yes"` ein Rollbalken, der nichts zu rollen hat.
 */
export const PREVIEW_SIZE: Record<PreviewFormat, [number, number]> = {
  INSTAGRAM_STANDARD: [320, 567],
  MOBILE_FEED_STANDARD: [420, 700],
  INSTAGRAM_REELS: [320, 624],
  FACEBOOK_REELS_MOBILE: [320, 567],
  INSTAGRAM_STORY: [320, 624],
};

const sized = (format: PreviewFormat) => ({ ad_format: format, width: PREVIEW_SIZE[format][0], height: PREVIEW_SIZE[format][1] });

/**
 * Meta liefert das iframe mit `scrolling="yes"`; auf einem Mac mit immer
 * sichtbaren Rollbalken steht damit an jeder Vorschau eine leere Schiene.
 * Der Inhalt ist auf die Größe oben zugeschnitten, das iframe hat nichts zu
 * rollen. (Der Rollbalken *im* Instagram-Feed-Mock ist Metas eigener
 * Telefonbildschirm – 318×565 mit 645 px Inhalt – und von außen nicht erreichbar.)
 */
const ohneRollbalken = (body: string) => body.replace('scrolling="yes"', 'scrolling="no"');

/** Das iframe-HTML einer Vorschau. Fünf Minuten gecacht – die Links darin halten länger. */
export async function adPreview(adId: string, format: PreviewFormat): Promise<string> {
  const r = await graph<{ data?: { body: string }[] }>(`${adId}/previews`, {
    params: sized(format),
    revalidate: 300,
    tags: ["campaigns"],
  });
  const body = r.data?.[0]?.body;
  if (!body) throw new Error("Meta liefert für dieses Format keine Vorschau.");
  return ohneRollbalken(body);
}

/** Vorschau für eine Anzeige, die es noch nicht gibt – aus dem Creative-Spec des Assistenten. */
export async function generatePreview(acct: string, creative: unknown, format: PreviewFormat): Promise<string> {
  const r = await graph<{ data?: { body: string }[] }>(`${acct}/generatepreviews`, {
    params: { creative, ...sized(format) },
    revalidate: 300,
    tags: ["campaigns"],
  });
  const body = r.data?.[0]?.body;
  if (!body) throw new Error("Meta liefert für dieses Format keine Vorschau.");
  return ohneRollbalken(body);
}

export const setAdStatus = (adId: string, status: "ACTIVE" | "PAUSED") =>
  graph(adId, { method: "POST", params: { status } });

export const deleteAd = (adId: string) => graph(adId, { method: "DELETE" });

// 31, nicht 25 (Vorgabe): sonst fehlen die ältesten Tage des Monats.
const DAILY = "insights.date_preset(last_30d).time_increment(1).limit(31).as(i_daily){date_start,spend,actions}";

export async function getCampaign(id: string): Promise<CampaignDetail> {
  const raw = await graph<any>(id, {
    params: {
      fields: `${FIELDS},account_id,spend_cap,${DAILY},adsets{name,status,daily_budget,optimization_goal,billing_event,targeting,promoted_object,${INSIGHTS},ads{name,status,creative{id,thumbnail_url,effective_object_story_id,video_id,object_story_spec,asset_feed_spec},${INSIGHTS}}}`,
    },
    revalidate: 60,
    tags: ["campaigns", `campaign:${id}`],
  });
  const strip = (x: any) => {
    const { adsets, ads, i_daily, ...rest } = x;
    for (const p of PERIODS) delete rest[ALIAS[p]];
    return rest;
  };
  return {
    ...strip(raw),
    insights: pickInsights(raw),
    tage: raw.i_daily?.data ?? [],
    seed: seedFromCampaign({ ...raw, id }),
    adsets: (raw.adsets?.data ?? []).map((s: any) => ({
      ...strip(s),
      insights: pickInsights(s),
      ads: (s.ads?.data ?? []).map((a: any) => ({ ...strip(a), insights: pickInsights(a) })),
    })),
  };
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
