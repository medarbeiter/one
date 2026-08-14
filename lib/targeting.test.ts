import { expect, test } from "bun:test";
import { buildTargeting, PORTRAIT_PLACEMENTS, SQUARE_PLACEMENTS } from "./targeting";

const base = { addressString: "Hauptstr. 1, 01067 Dresden", radiusKm: 17 };

test("address and radius become a custom location in kilometres", () => {
  const t = buildTargeting(base);
  expect(t.geo_locations.custom_locations).toEqual([
    {
      address_string: "Hauptstr. 1, 01067 Dresden",
      radius: 17,
      distance_unit: "kilometer",
    },
  ]);
});

test("ein gewählter Ort ersetzt die Adresse, nicht nur ihre Beschriftung", () => {
  // Sonst stünde die Stadt im Feld und Meta bekäme trotzdem die alte Adresse.
  const t = buildTargeting({
    addressString: "Hauptstr. 1, 01067 Dresden",
    radiusKm: 20,
    place: { type: "city", key: "549668", name: "Dresden", region: "Sachsen" },
  });
  expect(t.geo_locations.custom_locations).toBeUndefined();
  expect(t.geo_locations.cities).toEqual([
    { key: "549668", radius: 20, distance_unit: "kilometer" },
  ]);
});

test("feeds, stories, reels and profile feeds are targeted", () => {
  const t = buildTargeting(base);
  expect(t.publisher_platforms).toEqual(["facebook", "instagram"]);
  expect(t.facebook_positions).toEqual(["feed", "story", "facebook_reels", "profile_feed"]);
  expect(t.instagram_positions).toEqual(["stream", "story", "reels", "profile_feed"]);
});

test("the portrait bucket is a subset of what the ad set buys", () => {
  // Sonst kauft die Regel eine Platzierung, die das Ad Set gar nicht bucht –
  // die Hochformat-Hälfte hätte dann keinen Platz zum Ausspielen.
  const t = buildTargeting(base);
  for (const p of PORTRAIT_PLACEMENTS.facebook_positions)
    expect(t.facebook_positions).toContain(p);
  for (const p of PORTRAIT_PLACEMENTS.instagram_positions)
    expect(t.instagram_positions).toContain(p);
});

test("the square rule is a catch-all, so no placement is left without an asset", () => {
  expect(SQUARE_PLACEMENTS).toEqual({});
});

test("limited spend on excluded placements is never enabled", () => {
  // placement_soft_opt_out ist über die API opt-in (im Ads Manager opt-out).
  // Nichts zu schicken ist die Umsetzung – hier festgehalten, damit niemand
  // das Feld "hilfreich" nachrüstet.
  const t = buildTargeting(base) as Record<string, unknown>;
  expect(t.placement_soft_opt_out).toBeUndefined();
});

test("age and gender are never sent — EMPLOYMENT forbids them", () => {
  const t = buildTargeting(base) as Record<string, unknown>;
  expect(t.age_min).toBeUndefined();
  expect(t.age_max).toBeUndefined();
  expect(t.genders).toBeUndefined();
});

test("radius outside Meta's 1-80 km range is rejected", () => {
  expect(() => buildTargeting({ ...base, radiusKm: 0.5 })).toThrow(/1 und 80/);
  expect(() => buildTargeting({ ...base, radiusKm: 81 })).toThrow(/1 und 80/);
});

test("a blank address is rejected before it reaches Graph", () => {
  expect(() => buildTargeting({ ...base, addressString: "  " })).toThrow(/adresse/i);
});
