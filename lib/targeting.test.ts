import { expect, test } from "bun:test";
import { buildTargeting } from "./targeting";

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

test("only feed and stories are targeted", () => {
  const t = buildTargeting(base);
  expect(t.publisher_platforms).toEqual(["facebook", "instagram"]);
  expect(t.facebook_positions).toEqual(["feed", "story"]);
  expect(t.instagram_positions).toEqual(["stream", "story"]);
});

test("age and gender are never sent — EMPLOYMENT forbids them", () => {
  const t = buildTargeting(base) as Record<string, unknown>;
  expect(t.age_min).toBeUndefined();
  expect(t.age_max).toBeUndefined();
  expect(t.genders).toBeUndefined();
});

test("radius outside Meta's 1-80 km range is rejected", () => {
  expect(() => buildTargeting({ ...base, radiusKm: 0.5 })).toThrow(/1 and 80/);
  expect(() => buildTargeting({ ...base, radiusKm: 81 })).toThrow(/1 and 80/);
});

test("a blank address is rejected before it reaches Graph", () => {
  expect(() => buildTargeting({ ...base, addressString: "  " })).toThrow(/address/i);
});
