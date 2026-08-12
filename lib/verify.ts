/**
 * Liest die angelegte Kampagne zurück und prüft, was der Ablauf sonst per Auge
 * prüft: richtiges Formular an jeder Anzeige, alles veröffentlicht, Kampagne aus.
 */
import { graph } from "./graph";
import { PLACEMENTS } from "./targeting";

export type Check = { label: string; ok: boolean; detail?: string };
export type Intent = {
  formIds: Record<string, string>;
  radiusKm: number;
  adCount: number;
};

const formOf = (ad: any) =>
  ad?.creative?.object_story_spec?.video_data?.call_to_action?.value?.lead_gen_form_id;

const same = (a: string[] = [], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

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
  const badRadius = sets
    .filter(
      (s: any) =>
        s.targeting?.geo_locations?.custom_locations?.[0]?.radius !== intent.radiusKm,
    )
    .map((s: any) => s.name);

  return [
    {
      label: `All ${intent.adCount} ads created`,
      ok: ads.length === intent.adCount,
      detail: ads.length === intent.adCount ? undefined : `found ${ads.length}`,
    },
    {
      label: "Every ad uses the intended lead form",
      ok: wrongForm.length === 0,
      detail: wrongForm.join(", ") || undefined,
    },
    { label: "Every ad is published", ok: notLive.length === 0, detail: notLive.join(", ") || undefined },
    {
      label: "Placements limited to feed and stories",
      ok: badPlacement.length === 0,
      detail: badPlacement.join(", ") || undefined,
    },
    {
      label: `Radius is ${intent.radiusKm} km`,
      ok: badRadius.length === 0,
      detail: badRadius.join(", ") || undefined,
    },
    { label: "Campaign is paused", ok: tree?.status === "PAUSED", detail: tree?.status },
  ];
}

// Eigener Read statt getCampaign: dort fehlt object_story_spec, ohne das die
// Formular-Prüfung immer "undefined" sähe und grundlos fehlschlüge.
const VERIFY_FIELDS =
  "status,adsets{name,status,targeting,ads{name,status,creative{object_story_spec}}}";

export async function verifyCampaign(id: string, intent: Intent): Promise<Check[]> {
  const tree = await graph(id, { params: { fields: VERIFY_FIELDS } });
  return checkCampaign(tree, intent);
}
