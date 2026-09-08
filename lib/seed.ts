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
import type { AdInput, FormatAsset } from "./launch";
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
  /** Nur bei Gruppenbudget statt Kampagnenbudget – in dieser App die Ausnahme. */
  dailyBudgetCents?: number;
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
      } else if (Array.isArray(acr) && acr.length) {
        // Split. Der Ads Manager schreibt meist drei Regeln (Story/Reels, Feed,
        // Rest), und zwei davon tragen dasselbe Video – Reihenfolge und Anzahl
        // der Regeln sagen also nichts über die Hälften. Hochformat ist, was
        // in Story/Reels läuft; die andere Hälfte das erste davon verschiedene
        // Medium. Ein Medium in allen Regeln ist kein Paar, sondern UGC/Einzelbild.
        const findAsset = (rule: any): FormatAsset | null => {
          const label = rule?.video_label?.name || rule?.image_label?.name;
          if (!label) return null;
          const has = (x: any) => (x.adlabels ?? []).some((l: any) => l.name === label);
          const vid = (assetFeed.videos ?? []).find(has);
          if (vid?.video_id) return { kind: "video", videoId: String(vid.video_id), thumbnailUrl: vid.thumbnail_url ? String(vid.thumbnail_url) : undefined, fileName: adName };
          const img = (assetFeed.images ?? []).find(has);
          if (img?.hash) return { kind: "image", hash: String(img.hash), fileName: adName };
          return null;
        };
        const isPortraitRule = (r: any) => {
          const spec = r?.customization_spec ?? {};
          return [...(spec.facebook_positions ?? []), ...(spec.instagram_positions ?? [])].some((p: string) => /story|reels/.test(p));
        };
        const key = (a: FormatAsset) => (a.kind === "video" ? a.videoId : a.hash);

        const sortedRules = [...acr].sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));
        const portrait = findAsset(sortedRules.find(isPortraitRule) ?? sortedRules[0]);
        const square = portrait && sortedRules.map(findAsset).find((a) => a && key(a) !== key(portrait));

        if (portrait && square) seedAd = { metaId: adId, name: adName, type: "split", portrait, square };
        else if (portrait?.kind === "video") seedAd = { metaId: adId, name: adName, type: "ugc", asset: portrait };
        else if (portrait?.kind === "image") seedAd = { metaId: adId, name: adName, type: "single", asset: portrait };
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
      ...(set.daily_budget !== undefined ? { dailyBudgetCents: Number(set.daily_budget) } : {}),
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
