export { actId, graph, meta } from "./graph";
import { graph, meta } from "./graph";

/* ---------- Assets ---------- */

export type AdAccount = {
  id: string;
  name: string;
  account_status: number;
  currency: string;
};
export type Page = {
  id: string;
  name: string;
  link?: string;
  fan_count?: number;
};

// Kundenkonten liegen unter client_*, eigene unter owned_* – die Agentur braucht beides.
export async function listAssets() {
  const [ownAcc, clientAcc, ownPages, clientPages] = await Promise.all([
    listAll<AdAccount>("owned_ad_accounts", "name,account_status,currency"),
    listAll<AdAccount>("client_ad_accounts", "name,account_status,currency"),
    listAll<Page>("owned_pages", "name,link,fan_count"),
    listAll<Page>("client_pages", "name,link,fan_count"),
  ]);
  return {
    accounts: [...ownAcc, ...clientAcc],
    pages: [...ownPages, ...clientPages],
  };
}

// ponytail: erste Seite mit 500 Einträgen, kein Paging. Reicht bis ~500 Kunden.
async function listAll<T>(edge: string, fields: string): Promise<T[]> {
  const { data } = await graph<{ data: T[] }>(`${meta.business}/${edge}`, {
    params: { fields, limit: 500 },
  });
  return data;
}

export function listCampaigns(adAccount = meta.adAccount) {
  return graph<{
    data: { id: string; name: string; status: string; objective: string }[];
  }>(`${adAccount}/campaigns`, {
    params: { fields: "name,status,objective,daily_budget", limit: 50 },
  });
}

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
      throw new Error(`Video ${id}: Verarbeitung fehlgeschlagen`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Video ${id} nach 5 Min noch nicht fertig verarbeitet`);
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
      name: `${input.name} – Anzeigengruppe`,
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
