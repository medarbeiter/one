/**
 * Liest die angelegte Kampagne zurück und prüft, was der Ablauf sonst per Auge
 * prüft: richtiges Formular an jeder Anzeige, alles veröffentlicht, Kampagne aus.
 */
import { geoProblem, type GeoLocations } from "./geo";
import { graph } from "./graph";
import { PLACEMENTS, PORTRAIT_PLACEMENTS } from "./targeting";

export type Check = { label: string; ok: boolean; detail?: string };
export type Intent = {
  formIds: Record<string, string>;
  /** Der geo_locations-Block, der für diese Anzeigengruppe geschickt wurde –
   *  verglichen wird gegen ihn, nicht gegen eine einzelne Zahl. */
  geo: Record<string, GeoLocations>;
  adCount: number;
};

/**
 * Bei einer UGC-Anzeige hängt das Formular am object_story_spec, bei einer
 * Split-Anzeige im asset_feed_spec. Nur an der ersten Stelle zu suchen hieße:
 * jede Split-Anzeige fällt mit "falsches Formular" durch, obwohl ihres stimmt.
 */
const formOf = (ad: any) =>
  ad?.creative?.object_story_spec?.video_data?.call_to_action?.value?.lead_gen_form_id ??
  ad?.creative?.asset_feed_spec?.call_to_actions?.[0]?.value?.lead_gen_form_id;

const same = (a: string[] = [], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

const isSplit = (ad: any) =>
  Array.isArray(ad?.creative?.asset_feed_spec?.asset_customization_rules);

/**
 * Die Wege, auf denen eine Split-Anzeige still falsch sein kann: eine Regel ohne
 * Asset, ein Asset ohne Regel, ein fehlender Bucket. Alles davon sieht im Ads
 * Manager wie eine normale Anzeige aus.
 */
function splitProblem(ad: any): string | undefined {
  const feed = ad.creative.asset_feed_spec;
  const rules = feed.asset_customization_rules;
  if (rules.length !== 2) return `${rules.length} Customization Rule(s), 2 erwartet`;

  const labels = new Set(
    [...(feed.videos ?? []), ...(feed.images ?? [])].flatMap((a: any) =>
      (a.adlabels ?? []).map((l: any) => l.name),
    ),
  );
  for (const rule of rules) {
    const name = rule.video_label?.name ?? rule.image_label?.name;
    if (!name) return "eine Regel trägt kein Asset";
    if (!labels.has(name)) return `Regel-Label ${name} passt zu keinem Asset`;
  }

  const portrait = rules.some(
    (r: any) =>
      same(r.customization_spec?.facebook_positions, PORTRAIT_PLACEMENTS.facebook_positions) &&
      same(r.customization_spec?.instagram_positions, PORTRAIT_PLACEMENTS.instagram_positions),
  );
  if (!portrait) return "keine Regel zielt auf Stories und Reels";

  // Die Auffangregel erkennt man am Fehlen von Platzierungen. age_min/age_max
  // füllt Meta beim Lesen selbst ein und zählt hier nicht.
  const catchAll = rules.some((r: any) => {
    const spec = r.customization_spec ?? {};
    return !spec.facebook_positions && !spec.instagram_positions && !spec.publisher_platforms;
  });
  if (!catchAll) return "keine Auffangregel, daher hat eine Platzierung kein Asset";

  return undefined;
}

export function checkCampaign(tree: any, intent: Intent): Check[] {
  const sets = tree?.adsets?.data ?? [];
  const ads = sets.flatMap((s: any) => s.ads?.data ?? []);

  const wrongForm = sets.flatMap((s: any) =>
    (s.ads?.data ?? [])
      .filter((a: any) => formOf(a) !== intent.formIds[s.name])
      .map((a: any) => a.name),
  );
  const notLive = ads.filter((a: any) => a.status !== "ACTIVE").map((a: any) => a.name);
  const badPlacement = sets
    .filter(
      (s: any) =>
        !same(s.targeting?.facebook_positions, PLACEMENTS.facebook_positions) ||
        !same(s.targeting?.instagram_positions, PLACEMENTS.instagram_positions),
    )
    .map((s: any) => s.name);
  // Der Standort ist die eine Angabe, die still danebengehen und trotzdem Geld
  // kosten kann: eine nicht geocodierte Adresse liefert an niemanden, ein Topf
  // zu viel an die halbe Republik. Beides sieht im Ads Manager normal aus.
  const badGeo = sets
    .map((s: any) => ({
      name: s.name,
      problem: intent.geo[s.name]
        ? geoProblem(intent.geo[s.name], s.targeting?.geo_locations)
        : "kein Standort geplant",
    }))
    .filter((x: any) => x.problem)
    .map((x: any) => `${x.name}: ${x.problem}`);

  const splits = ads.filter(isSplit);
  const brokenSplits = splits
    .map((a: any) => ({ name: a.name, problem: splitProblem(a) }))
    .filter((x: any) => x.problem)
    .map((x: any) => `${x.name}: ${x.problem}`);

  // placement_soft_opt_out ist über die API opt-in, im Ads Manager opt-out.
  // Wir schicken nichts – und prüfen genau das nach, statt es zu glauben.
  const softOptOut = sets
    .filter((s: any) => {
      const spec = s.placement_soft_opt_out;
      return spec && Object.values(spec).some((v: any) => Array.isArray(v) && v.length > 0);
    })
    .map((s: any) => s.name);

  return [
    {
      label: `Alle ${intent.adCount} Anzeigen erstellt`,
      ok: ads.length === intent.adCount,
      detail: ads.length === intent.adCount ? undefined : `gefunden: ${ads.length}`,
    },
    {
      label: "Jede Anzeige nutzt das vorgesehene Lead-Formular",
      ok: wrongForm.length === 0,
      detail: wrongForm.join(", ") || undefined,
    },
    { label: "Jede Anzeige ist veröffentlicht", ok: notLive.length === 0, detail: notLive.join(", ") || undefined },
    {
      label: "Platzierungen umfassen Feeds, Stories und Reels",
      ok: badPlacement.length === 0,
      detail: badPlacement.join(", ") || undefined,
    },
    {
      label: "Keine eingeschränkten Ausgaben bei ausgeschlossenen Platzierungen",
      ok: softOptOut.length === 0,
      detail: softOptOut.join(", ") || undefined,
    },
    {
      label: `Beide Formate an allen ${splits.length} Split-Anzeige(n) gebunden`,
      ok: brokenSplits.length === 0,
      detail: brokenSplits.join(", ") || undefined,
    },
    {
      label: "Standort und Radius stimmen für jede Anzeigengruppe",
      ok: badGeo.length === 0,
      detail: badGeo.join(", ") || undefined,
    },
    { label: "Kampagne ist pausiert", ok: tree?.status === "PAUSED", detail: tree?.status },
  ];
}

// Eigener Read statt getCampaign: dort fehlen die Creative-Specs, ohne die die
// Formular-Prüfung immer "undefined" sähe und grundlos fehlschlüge.
const VERIFY_FIELDS =
  "status,adsets{name,status,targeting,placement_soft_opt_out,ads{name,status,creative{object_story_spec,asset_feed_spec}}}";

export async function verifyCampaign(id: string, intent: Intent): Promise<Check[]> {
  const tree = await graph(id, { params: { fields: VERIFY_FIELDS } });
  return checkCampaign(tree, intent);
}
