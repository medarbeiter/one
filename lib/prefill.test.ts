import { expect, test } from "bun:test";
import { defaultsFromAdSet, newestAdSet } from "./prefill";

test("address and radius come from the previous ad set", () => {
  const p = defaultsFromAdSet({
    targeting: {
      geo_locations: {
        custom_locations: [{ address_string: "Hauptstr. 1, Dresden", radius: 25 }],
      },
    },
  } as any);

  expect(p.addressString).toBe("Hauptstr. 1, Dresden");
  expect(p.radiusKm).toBe(25);
});

test("texts are never prefilled — they are rewritten every campaign", () => {
  // Ein leeres Feld sieht man; einen stehengebliebenen Text von letztem Mal nicht.
  const p = defaultsFromAdSet({
    targeting: {
      geo_locations: { custom_locations: [{ address_string: "Hauptstr. 1", radius: 25 }] },
    },
    ads: {
      data: [
        {
          creative: {
            asset_feed_spec: {
              bodies: [{ text: "b1" }, { text: "b2" }],
              titles: [{ text: "t1" }],
              descriptions: [{ text: "d1" }],
            },
          },
        },
      ],
    },
  } as any) as Record<string, unknown>;

  expect(p.bodies).toBeUndefined();
  expect(p.titles).toBeUndefined();
  expect(p.description).toBeUndefined();
});

test("zielte die letzte Kampagne auf eine Stadt, kommt die Stadt zurück", () => {
  // Sonst bekäme der Kunde ein leeres Standortfeld, obwohl sein Ort bei Meta
  // steht – nur eben in einem anderen Topf als custom_locations.
  const p = defaultsFromAdSet({
    targeting: {
      geo_locations: { cities: [{ key: 560419, name: "Hamburg", radius: 20 }] },
    },
  } as any);

  expect(p.place).toEqual({ type: "city", key: "560419", name: "Hamburg" });
  expect(p.radiusKm).toBe(20);
  expect(p.addressString).toBeUndefined();
});

test("an ad set without a custom location yields no address", () => {
  const p = defaultsFromAdSet({ targeting: { geo_locations: { countries: ["DE"] } } } as any);
  expect(p.addressString).toBeUndefined();
  expect(p.radiusKm).toBeUndefined();
});

test("a lead form is never prefilled — it differs every campaign", () => {
  const p = defaultsFromAdSet({} as any) as Record<string, unknown>;
  expect(p.formId).toBeUndefined();
});

// Die adsets-Edge garantiert laut Meta-Doku keine Reihenfolge (weder "neueste
// zuerst" noch sonst etwas) – limit:1 allein wäre ein Griff ins Blaue. Diese
// Tests belegen, dass wir client-seitig nach created_time sortieren, egal in
// welcher Reihenfolge Meta die Liste liefert.
test("newestAdSet picks the latest created_time regardless of list order", () => {
  const sets = [
    { id: "old", created_time: "2025-01-01T00:00:00+0000" },
    { id: "newest", created_time: "2026-06-15T00:00:00+0000" },
    { id: "middle", created_time: "2026-01-01T00:00:00+0000" },
  ];
  expect(newestAdSet(sets)?.id).toBe("newest");
});

test("newestAdSet is order-independent — same set, reversed input", () => {
  const sets = [
    { id: "middle", created_time: "2026-01-01T00:00:00+0000" },
    { id: "newest", created_time: "2026-06-15T00:00:00+0000" },
    { id: "old", created_time: "2025-01-01T00:00:00+0000" },
  ];
  expect(newestAdSet(sets)?.id).toBe("newest");
});

test("newestAdSet ignores entries without created_time", () => {
  const sets: { id: string; created_time?: string }[] = [
    { id: "no-date" },
    { id: "dated", created_time: "2026-01-01T00:00:00+0000" },
  ];
  expect(newestAdSet(sets)?.id).toBe("dated");
});

test("newestAdSet returns undefined for an empty list", () => {
  expect(newestAdSet([])).toBeUndefined();
});
