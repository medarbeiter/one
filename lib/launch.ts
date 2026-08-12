/**
 * Anlegen einer Kampagne nach dem Standardablauf der Agentur.
 * Die Creative-Form ist aus laufenden Kampagnen abgelesen, nicht aus der Doku:
 * asset_feed_spec trägt nur Text, object_story_spec Video und Formular –
 * beide zusammen in einem Creative. onsite_destinations wird nicht benutzt.
 */
export type CreativeInput = {
  pageId: string;
  instagramUserId?: string;
  videoId: string;
  thumbnailHash?: string;
  thumbnailUrl?: string;
  formId: string;
  bodies: string[];
  titles: string[];
  description: string;
  callToAction?: string;
};

export function buildCreative(i: CreativeInput) {
  if (!i.bodies.length || !i.titles.length)
    throw new Error("At least one primary text and one headline are required.");
  if (i.bodies.length > 5 || i.titles.length > 5)
    throw new Error("Meta allows at most 5 primary texts and 5 headlines.");
  if (!i.formId) throw new Error("A lead form must be selected.");

  return {
    object_story_spec: {
      page_id: i.pageId,
      ...(i.instagramUserId ? { instagram_user_id: i.instagramUserId } : {}),
      video_data: {
        video_id: i.videoId,
        ...(i.thumbnailHash
          ? { image_hash: i.thumbnailHash }
          : { image_url: i.thumbnailUrl }),
        call_to_action: {
          type: i.callToAction ?? "APPLY_NOW",
          // link ist bei Lead-Ads ein Platzhalter – Meta verlangt ihn trotzdem.
          value: { lead_gen_form_id: i.formId, link: "http://fb.me/" },
        },
      },
    },
    asset_feed_spec: {
      bodies: i.bodies.map((text) => ({ text })),
      titles: i.titles.map((text) => ({ text })),
      descriptions: [{ text: i.description }],
    },
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: { enroll_status: "OPT_OUT" },
      },
    },
  };
}

import { graph as realGraph } from "./graph";
import { buildTargeting } from "./targeting";

export type AdSetInput = {
  name: string;
  addressString: string;
  radiusKm: number;
  formId: string;
  instagramUserId?: string;
  bodies: string[];
  titles: string[];
  description: string;
  videos: { videoId: string; thumbnailUrl?: string; fileName: string }[];
  dailyBudgetCents?: number;
  /** Vorhandenes Ad Set weiterbauen statt neu anlegen (Retry) – sonst entstünde
   * neben dem Original ein zweites Ad Set mit demselben Namen. */
  existingAdSetId?: string;
};

export type LaunchInput = {
  adAccount: string;
  pageId: string;
  campaignName: string;
  dailyBudgetCents: number;
  spendCapCents?: number;
  adSets: AdSetInput[];
  /** Vorhandene Kampagne weiterbauen statt neu anlegen (Retry). */
  existingCampaignId?: string;
};

export type Receipt = {
  campaignId?: string;
  adSets: { id?: string; name: string; adIds: string[]; error?: string }[];
  failed: { adSetName: string; fileName: string; error: string }[];
};

export type LaunchDeps = { graph: typeof realGraph };

export async function launch(
  input: LaunchInput,
  deps: LaunchDeps = { graph: realGraph },
): Promise<Receipt> {
  const { graph } = deps;
  const acct = input.adAccount;
  const receipt: Receipt = { adSets: [], failed: [] };

  // Kampagne pausiert, alles darunter aktiv: so startet Metas Prüfung sofort,
  // ohne dass Budget fließt. Genau die Reihenfolge des manuellen Ablaufs.
  if (input.existingCampaignId) {
    receipt.campaignId = input.existingCampaignId;
  } else {
    const campaign = await graph<{ id: string }>(`${acct}/campaigns`, {
      method: "POST",
      params: {
        name: input.campaignName,
        objective: "OUTCOME_LEADS",
        status: "PAUSED",
        special_ad_categories: ["EMPLOYMENT"],
        special_ad_category_country: ["DE"],
        daily_budget: input.dailyBudgetCents,
        ...(input.spendCapCents ? { spend_cap: input.spendCapCents } : {}),
      },
    });
    receipt.campaignId = campaign.id;
  }

  for (const set of input.adSets) {
    const entry: Receipt["adSets"][number] = { name: set.name, adIds: [] };
    receipt.adSets.push(entry);

    if (set.existingAdSetId) {
      // Retry: das Ad Set gibt es schon, nur ein Teil seiner Anzeigen fehlt.
      entry.id = set.existingAdSetId;
    } else {
      try {
        const adset = await graph<{ id: string }>(`${acct}/adsets`, {
          method: "POST",
          params: {
            name: set.name,
            campaign_id: receipt.campaignId,
            status: "ACTIVE",
            destination_type: "ON_AD",
            promoted_object: { page_id: input.pageId },
            optimization_goal: "LEAD_GENERATION",
            billing_event: "IMPRESSIONS",
            bid_strategy: "LOWEST_COST_WITHOUT_CAP",
            targeting: buildTargeting({
              addressString: set.addressString,
              radiusKm: set.radiusKm,
            }),
            ...(set.dailyBudgetCents ? { daily_budget: set.dailyBudgetCents } : {}),
          },
        });
        entry.id = adset.id;
      } catch (e) {
        entry.error = (e as Error).message;
        // Ohne das hätte der Bediener keinen Weg, das komplette Ad Set über den
        // Retry nachzuholen – genau der Reparaturfall, für den die Receipt
        // existiert. Jedes Video zählt als "fehlgeschlagen", obwohl keins
        // einzeln versucht wurde.
        for (const video of set.videos) {
          receipt.failed.push({ adSetName: set.name, fileName: video.fileName, error: entry.error });
        }
        continue;
      }
    }

    for (const video of set.videos) {
      try {
        const creative = await graph<{ id: string }>(`${acct}/adcreatives`, {
          method: "POST",
          params: {
            name: `${input.campaignName} – ${video.fileName}`,
            ...buildCreative({
              pageId: input.pageId,
              instagramUserId: set.instagramUserId,
              videoId: video.videoId,
              thumbnailUrl: video.thumbnailUrl,
              formId: set.formId,
              bodies: set.bodies,
              titles: set.titles,
              description: set.description,
            }),
          },
        });
        const ad = await graph<{ id: string }>(`${acct}/ads`, {
          method: "POST",
          params: {
            name: `${input.campaignName} – ${video.fileName}`,
            adset_id: entry.id,
            creative: { creative_id: creative.id },
            status: "ACTIVE",
          },
        });
        entry.adIds.push(ad.id);
      } catch (e) {
        receipt.failed.push({
          adSetName: set.name,
          fileName: video.fileName,
          error: (e as Error).message,
        });
      }
    }
  }

  return receipt;
}
