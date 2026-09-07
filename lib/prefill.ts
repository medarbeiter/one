/**
 * Vorbelegung aus der letzten Kampagne des Kunden. Meta ist der einzige Speicher
 * der App – die Adresse steht schon in der vorherigen Anzeigengruppe.
 *
 * Übernommen wird ausschließlich der Ort. Weder das Formular noch die Texte:
 * das Formular ist jedes Mal ein anderes, und die Texte werden je Kampagne neu
 * geschrieben. Vorbelegte Texte aus der letzten Stellenanzeige stehen dann still
 * in der neuen, was schlimmer ist als ein leeres Feld – ein leeres Feld sieht
 * man, einen falschen Text von letztem Mal nicht.
 */
import { BUCKET, toGeoPlace, type GeoPlace } from "./geo";
import { graph } from "./graph";

export type Prefill = {
  addressString?: string;
  radiusKm?: number;
  place?: GeoPlace;
};

export function defaultsFromAdSet(set: any): Prefill {
  const geo = set?.targeting?.geo_locations;
  // Zielte die letzte Kampagne auf einen Ort statt auf eine Adresse, steht er in
  // einem anderen Topf – Stadt, PLZ, Bundesland, Bezirk oder Stadtteil. Nur
  // custom_locations zu lesen hieße: der Kunde bekommt ein leeres Feld, obwohl
  // sein Ort bei Meta steht. Beim Lesen liefert Meta Schlüssel und Namen mit;
  // toGeoPlace() in lib/geo.ts kennt die Töpfe und ihre Typen.
  for (const [type, bucket] of Object.entries(BUCKET)) {
    const item = geo?.[bucket]?.[0];
    const place = item && toGeoPlace({ ...item, type });
    if (place) return { place, radiusKm: item.radius };
  }
  const loc = geo?.custom_locations?.[0];
  return { addressString: loc?.address_string, radiusKm: loc?.radius };
}

/**
 * Meta dokumentiert für die adsets-Edge keine Reihenfolge – weder "neueste
 * zuerst" noch sonst etwas (geprüft gegen die Marketing-API-Referenz für
 * act_<ID>/adsets: nur date_preset, effective_status, is_completed,
 * time_range, updated_since sind dokumentiert, kein sort/order-Parameter).
 * limit:1 allein liefert also ein beliebiges Ad Set, nicht das neueste.
 * Deshalb client-seitig nach created_time sortieren statt der Meta-Reihenfolge
 * zu vertrauen.
 */
export function newestAdSet<T extends { created_time?: string; promoted_object?: { page_id?: string } }>(
  list: T[],
  pageId?: string,
): T | undefined {
  return list.reduce<T | undefined>((newest, cur) => {
    if (!cur.created_time) return newest;
    // Ein Zahlerkonto, viele Kunden: ohne diesen Filter käme die Adresse des
    // Kunden, der zuletzt dran war – nicht die dieses Kunden.
    if (pageId && String(cur.promoted_object?.page_id ?? "") !== pageId) return newest;
    if (!newest?.created_time) return cur;
    return new Date(cur.created_time) > new Date(newest.created_time) ? cur : newest;
  }, undefined);
}

export async function lastCampaignDefaults(
  adAccount: string,
  pageId: string,
): Promise<Prefill | undefined> {
  // Erster Aufruf: nur IDs, created_time und die Seite, damit wir sortieren und
  // nach Kunde filtern können, ohne für jedes Ad Set im Konto gleich die volle
  // Creative-Tiefe zu laden. Die Seite steht im promoted_object – nach ihr
  // filtern kann Meta nicht (adset.promoted_object.page_id ist kein
  // Filterfeld, geprüft), also seitenweise lesen, bis ein Treffer da ist.
  // ponytail: bricht bei der ersten Seite mit Treffer ab – Meta liefert in der
  // Praxis neueste zuerst, dokumentiert ist keine Reihenfolge. Alle Seiten
  // lesen, falls je ein älterer Treffer vor einem neueren auftaucht.
  type Row = { id: string; created_time?: string; promoted_object?: { page_id?: string } };
  let after: string | undefined;
  let newest: Row | undefined;
  do {
    const { data, paging } = await graph<{
      data: Row[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${adAccount}/adsets`, {
      params: { fields: "created_time,promoted_object{page_id}", limit: 500, ...(after && { after }) },
      revalidate: 300,
      tags: ["campaigns"],
    });
    newest = newestAdSet(data ?? [], pageId);
    after = paging?.next ? paging.cursors?.after : undefined;
  } while (!newest && after);
  if (!newest) return undefined;

  // Zweiter Aufruf: gezielt das eine gefundene Ad Set. Nur targeting – seit die
  // Texte nicht mehr übernommen werden, muss dafür auch keine Anzeige samt
  // Creative mitgeladen werden.
  const full = await graph<any>(newest.id, {
    params: { fields: "targeting" },
    revalidate: 300,
    tags: ["campaigns"],
  });
  return defaultsFromAdSet(full);
}
