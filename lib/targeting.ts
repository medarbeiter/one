import { geoLocations, locationProblem, type GeoLocations, type GeoPlace } from "./geo";

/**
 * Targeting für Stellenanzeigen. Alle Werte sind gegen bestehende Kampagnen
 * geprüft (siehe Spec §5.2) – "stream" ist Instagrams Feed, nicht "feed".
 * Alter und Geschlecht fehlen absichtlich: EMPLOYMENT verbietet beides.
 */
export const PLACEMENTS = {
  publisher_platforms: ["facebook", "instagram"],
  facebook_positions: ["feed", "story", "facebook_reels", "profile_feed"],
  instagram_positions: ["stream", "story", "reels", "profile_feed"],
} as const;

/**
 * Der Hochformat-Bucket einer Split-Anzeige. Aus den laufenden Kampagnen
 * abgelesen: Story und Reels teilen sich dort immer dasselbe 9:16-Asset.
 * Ohne Reels in PLACEMENTS hätte diese Hälfte gar keinen Platz zum Ausspielen.
 */
export const PORTRAIT_PLACEMENTS = {
  publisher_platforms: ["facebook", "instagram"],
  facebook_positions: ["story", "facebook_reels"],
  instagram_positions: ["story", "reels"],
} as const;

/**
 * Die zweite Regel bekommt bewusst *keine* Platzierungen: als Auffangregel deckt
 * sie alles ab, was die erste nicht nimmt – Feed und Profil-Feed also
 * automatisch. Zwei Regeln decken damit per Konstruktion jede Platzierung ab,
 * keine kann ohne Asset dastehen. Gegen die Graph API mit
 * execution_options=['validate_only'] geprüft: eine leere customization_spec
 * wird angenommen.
 *
 * Alter und Geschlecht stehen hier nicht drin: EMPLOYMENT verbietet beides. Was
 * beim Lesen aus der API zurückkommt (age_min 13, age_max 65), füllt Meta
 * selbst ein – geschrieben wird es nicht.
 */
export const SQUARE_PLACEMENTS = {} as const;

export type TargetingInput = {
  addressString: string;
  radiusKm: number;
  /** Ein Ort aus Metas Verzeichnis statt der getippten Adresse (siehe lib/geo.ts). */
  place?: GeoPlace;
  countries?: string[];
};

export type Targeting = { geo_locations: GeoLocations } & typeof PLACEMENTS;

export function buildTargeting(i: TargetingInput): Targeting {
  // Grenzen und Töpfe stehen in lib/geo.ts, weil die Reichweitenschätzung im
  // Assistenten dieselben braucht. Zwei Fassungen wären eine zu viel: der
  // Assistent zeigte dann eine Zahl für ein anderes Targeting, als er bucht.
  const problem = locationProblem(i);
  if (problem) throw new Error(problem);

  return { geo_locations: geoLocations(i), ...PLACEMENTS };
}
