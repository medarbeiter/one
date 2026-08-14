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
import type { GeoPlace } from "./geo";
import { graph } from "./graph";

export type Prefill = {
  addressString?: string;
  radiusKm?: number;
  place?: GeoPlace;
};

export function defaultsFromAdSet(set: any): Prefill {
  const geo = set?.targeting?.geo_locations;
  // Zielte die letzte Kampagne auf eine Stadt statt auf eine Adresse, steht der
  // Ort in einem anderen Topf. Nur custom_locations zu lesen hieße: der Kunde
  // bekommt ein leeres Feld, obwohl sein Ort bei Meta steht. Namen liefert Meta
  // beim Lesen nicht mit – der Schlüssel allein reicht fürs Targeting, die
  // Beschriftung holt der Assistent über die Ortssuche nach.
  const city = geo?.cities?.[0];
  if (city?.key)
    return {
      place: { type: "city", key: String(city.key), name: geo.cities[0].name ?? String(city.key) },
      radiusKm: city.radius,
    };
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
export function newestAdSet<T extends { created_time?: string }>(list: T[]): T | undefined {
  return list.reduce<T | undefined>((newest, cur) => {
    if (!cur.created_time) return newest;
    if (!newest?.created_time) return cur;
    return new Date(cur.created_time) > new Date(newest.created_time) ? cur : newest;
  }, undefined);
}

export async function lastCampaignDefaults(
  adAccount: string,
): Promise<Prefill | undefined> {
  // Erster Aufruf: nur IDs + created_time, damit wir sortieren können, ohne
  // für jedes Ad Set im Konto gleich die volle Creative-Tiefe zu laden.
  const { data } = await graph<{ data: { id: string; created_time?: string }[] }>(
    `${adAccount}/adsets`,
    {
      params: { fields: "created_time", limit: 50 },
      revalidate: 300,
      tags: ["campaigns"],
    },
  );
  const newest = newestAdSet(data ?? []);
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
