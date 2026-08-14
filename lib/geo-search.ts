/**
 * Die zwei Meta-Aufrufe hinter dem Standortfeld: Orte suchen und Reichweite
 * schätzen. Getrennt von lib/geo.ts, weil das dort Berechnete auch im Browser
 * läuft – hier hängt das Token dran, das nie im Client-Bundle landen darf.
 *
 * Beide Aufrufe legen bei Meta nichts an. `search` liest ein Verzeichnis,
 * `delivery_estimate` rechnet nur.
 */
import { toGeoPlace, geoLocations, type GeoPlace } from "./geo";
import { actId, graph } from "./graph";
import { PLACEMENTS } from "./targeting";

/**
 * Straßen liefert Meta nicht: `location_types` kennt weder "place" noch
 * "custom_location" mit Ergebnissen (beide geben leere Listen zurück, geprüft
 * für DE). Was es gibt, ist das hier – und das reicht für die häufigen Fälle
 * "ganze Stadt", "ein Bezirk", "ein PLZ-Gebiet".
 */
const LOCATION_TYPES = ["city", "zip", "subcity", "neighborhood", "region"];

/**
 * Städte zuerst. Metas Relevanzreihenfolge stellt bei "Dresden" gern einen
 * Stadtteil vor die Stadt, und wer eine Stadt sucht, soll sie nicht suchen
 * müssen. Innerhalb einer Art bleibt Metas Reihenfolge stehen.
 */
const RANK: Record<GeoPlace["type"], number> = {
  city: 0,
  zip: 1,
  subcity: 2,
  neighborhood: 3,
  region: 4,
};

export async function searchPlaces(q: string, countryCode = "DE"): Promise<GeoPlace[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const { data } = await graph<{ data: unknown[] }>("search", {
    params: {
      type: "adgeolocation",
      q: query,
      location_types: LOCATION_TYPES,
      country_code: countryCode,
      limit: 25,
    },
    // Metas Ortsverzeichnis ändert sich nicht im Tagesrhythmus, das Tippen im
    // Feld aber schon: ohne Cache ginge jeder Tastendruck als eigener Aufruf
    // gegen das API-Limit des Tokens.
    revalidate: 86_400,
    tags: ["geo"],
  });

  const seen = new Set<string>();
  return (data ?? [])
    .map(toGeoPlace)
    .filter((p): p is GeoPlace => {
      if (!p || seen.has(p.key)) return false;
      seen.add(p.key);
      return true;
    })
    .sort((a, b) => RANK[a.type] - RANK[b.type]);
}

/**
 * `ready: false` ist Metas Art zu sagen "daraus wird nichts": eine Adresse, die
 * es nicht geocodieren konnte, und ein Radius unterhalb seiner Grenze liefern
 * beide 0 und lassen estimate_ready weg. Das als Zahl "0" anzuzeigen wäre
 * falsch – niemand hat null Menschen im Umkreis, die Angabe fehlt schlicht.
 */
export type Reach = { ready: true; lower: number; upper: number } | { ready: false };

export async function estimateReach(
  adAccount: string,
  i: { addressString: string; radiusKm: number; place?: GeoPlace },
): Promise<Reach> {
  const { data } = await graph<{
    data: {
      estimate_mau_lower_bound?: number;
      estimate_mau_upper_bound?: number;
      estimate_ready?: boolean;
    }[];
  }>(`${actId(adAccount)}/delivery_estimate`, {
    params: {
      // Dasselbe Ziel, auf das die Anzeigengruppe später optimiert – eine
      // Schätzung für ein anderes Ziel wäre eine Zahl für eine andere Kampagne.
      optimization_goal: "LEAD_GENERATION",
      targeting_spec: { geo_locations: geoLocations(i), ...PLACEMENTS },
    },
    revalidate: 3600,
    tags: ["geo"],
  });

  const e = data?.[0];
  if (!e?.estimate_ready) return { ready: false };
  return {
    ready: true,
    lower: e.estimate_mau_lower_bound ?? 0,
    upper: e.estimate_mau_upper_bound ?? 0,
  };
}
