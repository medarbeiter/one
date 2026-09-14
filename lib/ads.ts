/**
 * Eine Anzeige zu einer bestehenden Anzeigengruppe – ohne den Assistenten.
 * Texte, Formular, Seite und Instagram-Konto kommen von den Geschwistern:
 * eine neue Anzeige in einer laufenden Gruppe soll aussehen wie die anderen,
 * nur mit anderem Motiv.
 */
import { graph } from "./graph";
import { buildCreative, type FormatAsset } from "./launch";
import { creativeTexts } from "./seed";
import type { Creative } from "./campaigns";

export type NewAd = { name: string; asset: FormatAsset };

/** Reine Abbildung: die Parameter des neuen Creatives aus einem Geschwister-Creative. */
export function creativeFromSibling(sibling: Creative | undefined, ad: NewAd) {
  const obj = sibling?.object_story_spec;
  if (!obj?.page_id) throw new Error("Die Anzeigengruppe hat keine Anzeige, von der Texte und Seite übernommen werden könnten.");
  const texte = creativeTexts(sibling);
  return {
    name: ad.name,
    ...buildCreative({
      pageId: String(obj.page_id),
      instagramUserId: obj.instagram_user_id ? String(obj.instagram_user_id) : undefined,
      formId: texte.formId,
      bodies: texte.bodies.filter(Boolean),
      titles: texte.titles.filter(Boolean),
      description: texte.description,
      callToAction: texte.callToAction,
      ad:
        ad.asset.kind === "video"
          ? { name: ad.name, type: "ugc", asset: ad.asset }
          : { name: ad.name, type: "single", asset: ad.asset },
    }),
  };
}

export async function addAd(
  acct: string,
  adsetId: string,
  sibling: Creative | undefined,
  ad: NewAd,
): Promise<string> {
  const creative = await graph<{ id: string }>(`${acct}/adcreatives`, {
    method: "POST",
    params: creativeFromSibling(sibling, ad),
  });
  // Pausiert, wie der Assistent Kampagnen anlegt: live schalten ist ein
  // eigener, nachgefragter Schritt – nicht die Nebenwirkung eines Uploads.
  const created = await graph<{ id: string }>(`${acct}/ads`, {
    method: "POST",
    params: { name: ad.name, adset_id: adsetId, status: "PAUSED", creative: { creative_id: creative.id } },
  });
  return created.id;
}
