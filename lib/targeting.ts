/**
 * Targeting für Stellenanzeigen. Alle Werte sind gegen bestehende Kampagnen
 * geprüft (siehe Spec §5.2) – "stream" ist Instagrams Feed, nicht "feed".
 * Alter und Geschlecht fehlen absichtlich: EMPLOYMENT verbietet beides.
 */
export const PLACEMENTS = {
  publisher_platforms: ["facebook", "instagram"],
  facebook_positions: ["feed", "story"],
  instagram_positions: ["stream", "story"],
} as const;

export type TargetingInput = {
  addressString: string;
  radiusKm: number;
  countries?: string[];
};

export type Targeting = {
  geo_locations: {
    custom_locations: {
      address_string: string;
      radius: number;
      distance_unit: "kilometer";
    }[];
  };
} & typeof PLACEMENTS;

export function buildTargeting(i: TargetingInput): Targeting {
  const address = i.addressString.trim();
  if (!address) throw new Error("An exact address is required for radius targeting.");
  // Metas Grenzen für custom_locations; darunter/darüber lehnt Graph erst
  // beim Anlegen der Anzeigengruppe ab – zu spät, um es sinnvoll zu zeigen.
  if (!(i.radiusKm >= 1 && i.radiusKm <= 80))
    throw new Error("Radius must be between 1 and 80 km.");

  return {
    geo_locations: {
      custom_locations: [
        { address_string: address, radius: i.radiusKm, distance_unit: "kilometer" },
      ],
    },
    ...PLACEMENTS,
  };
}
