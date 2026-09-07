/**
 * Eine bestehende Kampagne als Vorlage für den Assistenten: Duplizieren heißt
 * hier nicht „bei Meta kopieren“, sondern eine neue Kampagne mit denselben
 * Werten anlegen – prüfbar und änderbar, bevor irgendetwas entsteht. Bearbeiten
 * liest denselben Stand und merkt sich zusätzlich die Meta-IDs, damit
 * lib/launch.ts die Kampagne an Ort und Stelle ändern kann.
 *
 * Gelesen wird nur, was der Assistent selbst schreibt (siehe lib/launch.ts):
 * Standort-Targeting, Lead-Formular, Texte im asset_feed_spec, Video-ID bzw.
 * Bild-Hash. Was nicht in dieses Modell passt (Karussell, Link-Anzeige ohne
 * Formular), fällt mit einer Warnung heraus statt halb übernommen zu werden.
 */
import { graph as realGraph } from "./graph";
import type { AdInput } from "./launch";
import { defaultsFromAdSet } from "./prefill";
import type { GeoPlace } from "./geo";

/** Eine Anzeige aus Meta, wie lib/launch.ts sie anlegen würde – plus ihre ID dort. */
export type SeedAd = AdInput & { metaId: string };

export type SeedAdSet = {
  metaId: string;
  name: string;
  addressString: string;
  radiusKm: number;
  place?: GeoPlace;
  formId: string;
  bodies: string[];
  titles: string[];
  description: string;
  ads: SeedAd[];
};

export type CampaignSeed = {
  campaignId: string;
  name: string;
  status: string;
  /** Die Seite aus promoted_object der ersten Anzeigengruppe – sie bestimmt den Kunden. */
  pageId?: string;
  dailyBudgetEuros?: number;
  spendCapEuros?: number;
  adSets: SeedAdSet[];
  /** Was nicht übernommen wurde – je Zeile ein Satz für das Warnbanner im Assistenten. */
  warnings: string[];
};

/** Alles, was seedFromCampaign() liest – ein Aufruf, die ganze Kampagne. */
export const SEED_FIELDS =
  "name,status,daily_budget,spend_cap," +
  "adsets{id,name,status,daily_budget,targeting,promoted_object," +
  "ads{id,name,status,creative{object_story_spec,asset_feed_spec}}}";

/** Reine Abbildung der Graph-Antwort – ohne Netz, damit sie testbar bleibt. */
export function seedFromCampaign(raw: unknown): CampaignSeed {
  const c = raw as Record<string, any>;
  if (!c || typeof c !== "object") throw new Error("Kampagne ungültig");

  const warnings: string[] = [];
  const adSets: SeedAdSet[] = [];
  const adsetsData = c.adsets?.data ?? [];
  const pageId = String(adsetsData[0]?.promoted_object?.page_id ?? "");

  for (const set of adsetsData) {
    if (set.status === "DELETED") continue;
    const metaId = String(set.id);
    const name = String(set.name);

    const defaults = defaultsFromAdSet(set) || {};
    const addressString = defaults.addressString ?? "";
    const radiusKm = defaults.radiusKm ?? 17;
    const place = defaults.place;

    const seedAds: SeedAd[] = [];
    let formId = "";
    let bodies = [""];
    let titles = [""];
    let description = "";

    const adsData = set.ads?.data ?? [];
    let firstMappableTextAd: any = null;

    for (const ad of adsData) {
      if (ad.status === "DELETED") continue;
      const adId = String(ad.id);
      const adName = String(ad.name);
      const creative = ad.creative;
      if (!creative) continue;

      const objStory = creative.object_story_spec ?? {};
      const assetFeed = creative.asset_feed_spec ?? {};

      const videoData = objStory.video_data;
      const linkData = objStory.link_data;
      const acr = assetFeed.asset_customization_rules;

      let seedAd: SeedAd | null = null;

      if (videoData?.video_id) {
        seedAd = {
          metaId: adId,
          name: adName,
          type: "ugc",
          asset: {
            kind: "video",
            videoId: String(videoData.video_id),
            thumbnailUrl: videoData.image_url ? String(videoData.image_url) : undefined,
            fileName: adName,
          },
        };
      } else if (linkData?.image_hash) {
        seedAd = {
          metaId: adId,
          name: adName,
          type: "single",
          asset: {
            kind: "image",
            hash: String(linkData.image_hash),
            fileName: adName,
          },
        };
      } else if (Array.isArray(acr) && acr.length >= 2) {
        // split
        const sortedRules = [...acr].sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));
        const portraitRule = sortedRules[0];
        const squareRule = sortedRules[1];

        const getLabel = (rule: any) => rule?.video_label?.name || rule?.image_label?.name;
        const portraitLabel = getLabel(portraitRule);
        const squareLabel = getLabel(squareRule);

        const findAsset = (label: string): any => {
          if (!label) return null;
          const vid = (assetFeed.videos ?? []).find((v: any) => (v.adlabels ?? []).some((l: any) => l.name === label));
          if (vid?.video_id) return { kind: "video", videoId: String(vid.video_id), thumbnailUrl: vid.thumbnail_url ? String(vid.thumbnail_url) : undefined, fileName: adName };
          const img = (assetFeed.images ?? []).find((i: any) => (i.adlabels ?? []).some((l: any) => l.name === label));
          if (img?.hash) return { kind: "image", hash: String(img.hash), fileName: adName };
          return null;
        };

        const portraitAsset = findAsset(portraitLabel);
        const squareAsset = findAsset(squareLabel);

        if (portraitAsset && squareAsset) {
          seedAd = {
            metaId: adId,
            name: adName,
            type: "split",
            portrait: portraitAsset,
            square: squareAsset,
          };
        }
      }

      if (seedAd) {
        seedAds.push(seedAd);
        if (!firstMappableTextAd) firstMappableTextAd = creative;
      } else {
        warnings.push(`„${name}“: Anzeige „${adName}“ hat kein Format, das der Assistent kennt – nicht übernommen.`);
      }
    }

    if (firstMappableTextAd) {
      const obj = firstMappableTextAd.object_story_spec ?? {};
      const af = firstMappableTextAd.asset_feed_spec ?? {};

      const b = (af.bodies ?? []).map((b: any) => b.text?.trim()).filter(Boolean);
      if (b.length) {
        bodies = b;
      } else {
        const msg = obj.video_data?.message ?? obj.link_data?.message;
        if (msg?.trim()) bodies = [msg.trim()];
      }

      const t = (af.titles ?? []).map((t: any) => t.text?.trim()).filter(Boolean);
      if (t.length) {
        titles = t;
      } else {
        const fallbackT = obj.video_data?.title ?? obj.link_data?.name;
        if (fallbackT?.trim()) titles = [fallbackT.trim()];
      }

      description = af.descriptions?.[0]?.text?.trim() ?? "";

      const vdFormId = obj.video_data?.call_to_action?.value?.lead_gen_form_id;
      const ldFormId = obj.link_data?.call_to_action?.value?.lead_gen_form_id;
      const afFormId = af.call_to_actions?.[0]?.value?.lead_gen_form_id;

      formId = String(vdFormId ?? ldFormId ?? afFormId ?? "");
    }

    if (!formId) {
      warnings.push(`„${name}“: kein Lead-Formular gefunden – bitte wählen.`);
    }

    adSets.push({
      metaId,
      name,
      addressString,
      radiusKm,
      place,
      formId,
      bodies,
      titles,
      description,
      ads: seedAds,
    });
  }

  const daily_budget = c.daily_budget !== undefined ? Number(c.daily_budget) / 100 : undefined;
  const spend_cap = c.spend_cap !== undefined ? Number(c.spend_cap) / 100 : undefined;

  return {
    campaignId: String(c.id || ""),
    name: String(c.name || ""),
    status: String(c.status || ""),
    pageId: pageId || undefined,
    dailyBudgetEuros: daily_budget,
    spendCapEuros: spend_cap,
    adSets,
    warnings,
  };
}

export async function readCampaignSeed(
  campaignId: string,
  deps: { graph?: typeof realGraph } = {},
): Promise<CampaignSeed> {
  const graph = deps.graph ?? realGraph;
  const raw = await graph(campaignId, { params: { fields: SEED_FIELDS }, revalidate: 60, tags: ["campaigns", `campaign:${campaignId}`] });
  return seedFromCampaign({ ...raw, id: campaignId });
}
