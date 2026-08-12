/**
 * Geldrechnung: Ergebnisse und Kosten pro Ergebnis. Meta liefert je Objective
 * andere action_types, deshalb eine feste Rangfolge statt "das erste".
 * Außerdem: das Targeting-Verbot bei Sonderkategorien und die
 * Parameter-Serialisierung beim Anlegen einer Kampagne.
 */
import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";
process.env.META_AD_ACCOUNT_ID = "act_1";
process.env.META_PAGE_ID = "page_1";

const { results, costPerResult, launch } = await import("./campaigns");

const a = (action_type: string, value: string) => ({ action_type, value });

function stub(handler: (url: URL) => unknown) {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    calls.push(url);
    return new Response(JSON.stringify(handler(url)), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

test("Leads schlagen Klicks, Klicks schlagen Interaktionen", () => {
  expect(results({ actions: [a("post_engagement", "90"), a("lead", "3")] })).toBe(3);
  expect(results({ actions: [a("post_engagement", "90"), a("link_click", "12")] })).toBe(12);
  expect(results({ actions: [a("post_engagement", "90")] })).toBe(90);
});

test("Ohne Actions gibt es kein Ergebnis – nicht null", () => {
  expect(results(undefined)).toBeUndefined();
  expect(results({ actions: [] })).toBeUndefined();
  expect(results({ actions: [a("video_view", "5")] })).toBeUndefined();
});

test("Kosten pro Ergebnis, ohne Division durch null", () => {
  expect(costPerResult({ spend: "30.00", actions: [a("lead", "3")] })).toBe(10);
  expect(costPerResult({ spend: "30.00", actions: [a("lead", "0")] })).toBeUndefined();
  expect(costPerResult({ spend: "30.00" })).toBeUndefined();
  expect(costPerResult({ actions: [a("lead", "3")] })).toBeUndefined();
});

test("EMPLOYMENT: kein Alters-Targeting, Land wird mitgeschickt", async () => {
  const calls = stub((url) =>
    url.pathname.endsWith("/adimages")
      ? { images: { a: { hash: "h" } } }
      : { id: "1" },
  );
  await launch({
    adAccount: "act_1",
    pageId: "page_1",
    name: "Pflegekräfte",
    objective: "OUTCOME_LEADS",
    dailyBudgetCents: 2000,
    optimizationGoal: "LEAD_GENERATION",
    billingEvent: "IMPRESSIONS",
    specialAdCategories: ["EMPLOYMENT"],
    countries: ["DE"],
    ageMin: 25,
    ageMax: 55,
    link: "https://medarbeiter.de",
    message: "Text",
    headline: "Titel",
    callToAction: "APPLY_NOW",
    files: [new File(["x"], "bild.jpg", { type: "image/jpeg" })],
  });

  const adset = calls.find((c) => c.pathname.endsWith("/adsets"))!;
  const targeting = adset.searchParams.get("targeting")!;
  expect(targeting).not.toContain("age_min");
  const campaign = calls.find((c) => c.pathname.endsWith("/campaigns"))!;
  expect(campaign.searchParams.get("special_ad_category_country")).toBe(
    '["DE"]',
  );
  expect(campaign.searchParams.get("status")).toBe("PAUSED");
});
