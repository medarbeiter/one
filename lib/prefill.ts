/**
 * Vorbelegung aus der letzten Kampagne des Kunden. Meta ist der einzige Speicher
 * der App – Adresse und Texte stehen schon in der vorherigen Anzeigengruppe.
 * Das Formular wird bewusst nicht übernommen: es ist jedes Mal ein anderes.
 */
import { graph } from "./graph";

export type Prefill = {
  addressString?: string;
  radiusKm?: number;
  bodies?: string[];
  titles?: string[];
  description?: string;
};

const texts = (a?: { text: string }[]) => a?.map((x) => x.text);

export function defaultsFromAdSet(set: any): Prefill {
  const loc = set?.targeting?.geo_locations?.custom_locations?.[0];
  const feed = set?.ads?.data?.[0]?.creative?.asset_feed_spec;
  return {
    addressString: loc?.address_string,
    radiusKm: loc?.radius,
    bodies: texts(feed?.bodies),
    titles: texts(feed?.titles),
    description: texts(feed?.descriptions)?.[0],
  };
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

  // Zweiter Aufruf: gezielt das eine gefundene Ad Set mit den Feldern, die
  // defaultsFromAdSet braucht.
  const full = await graph<any>(newest.id, {
    params: { fields: "targeting,ads.limit(1){creative{asset_feed_spec}}" },
    revalidate: 300,
    tags: ["campaigns"],
  });
  return defaultsFromAdSet(full);
}

export async function pageInstagramId(pageId: string): Promise<string | undefined> {
  // Braucht die Seite am System-Nutzer (bun run assign) – fehlt sie, ist das
  // kein Grund, den Assistenten zu blockieren.
  try {
    const r = await graph<{ instagram_business_account?: { id: string } }>(pageId, {
      params: { fields: "instagram_business_account" },
      revalidate: 3600,
      tags: ["assets"],
    });
    return r.instagram_business_account?.id;
  } catch {
    return undefined;
  }
}
