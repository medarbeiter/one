/**
 * Adresse ↔ Koordinate über Photon (komoot, OpenStreetMap-Daten). Nur für die
 * Karte im Standortfeld: was zu Meta geht, ist der getippte Text oder der
 * gesetzte Pin – nie das, was Photon daraus gemacht hat. Zwei Geocoder, die
 * sich uneins sind, wären sonst ein stiller Fehler im Targeting.
 *
 * Kein Schlüssel, keine Kosten, „fair use“. Gecacht, weil dieselbe Adresse
 * bei jedem Aufklappen des Standorts wieder gefragt würde.
 */
import type { GeoPin } from "./geo";

const PHOTON = "https://photon.komoot.io";
/** Deutschland – die Kunden stehen hier, und „Neustadt“ gibt es sonst überall.
 *  Die bbox ist bei Photon ein Filter, kein Land: Tschechien liegt zur Hälfte
 *  darin. Deshalb zusätzlich der erste deutsche Treffer aus mehreren. */
const DE_BBOX = "5.8,47.2,15.1,55.1";

export type PhotonAddress = {
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  district?: string;
  countrycode?: string;
};

type PhotonFeature = { geometry: { coordinates: [number, number] }; properties: PhotonAddress };

async function photon(path: string, params: Record<string, string>): Promise<PhotonFeature[]> {
  const url = new URL(path, PHOTON);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "User-Agent": "medarbeiter_one campaign wizard" },
    next: { revalidate: 86_400 },
  });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return body.features ?? [];
}

export async function geocode(q: string): Promise<GeoPin | undefined> {
  const query = q.trim();
  if (query.length < 3) return undefined;
  const hits = await photon("/api/", { q: query, limit: "5", lang: "de", bbox: DE_BBOX });
  const hit = hits.find((h) => h.properties.countrycode === "DE") ?? hits[0];
  if (!hit) return undefined;
  const [lng, lat] = hit.geometry.coordinates;
  return { lat, lng };
}

export async function reverseGeocode(pin: GeoPin): Promise<string | undefined> {
  const [hit] = await photon("/reverse", { lat: String(pin.lat), lon: String(pin.lng), lang: "de", limit: "1" });
  return hit && formatAddress(hit.properties);
}

/** „Valentinskamp 88, 20355 Hamburg“ – die Form, die auch ein Mensch tippen würde. */
export function formatAddress(p: PhotonAddress): string | undefined {
  const town = p.city ?? p.district;
  // Ein Ort ohne Straße kommt als name zurück – und der ist bei einem Dorf
  // derselbe wie die Stadt. Dann nicht „Kleinort, 01234 Kleinort“.
  const streetName = p.street ?? (p.name !== town ? p.name : undefined);
  const street = [streetName, p.housenumber].filter(Boolean).join(" ");
  const line2 = [p.postcode, town].filter(Boolean).join(" ");
  return [street, line2].filter(Boolean).join(", ") || undefined;
}
