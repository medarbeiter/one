/**
 * bun test – stubbt fetch, prüft die zwei Stellen die still kaputtgehen können:
 * Parameter-Serialisierung und das Targeting-Verbot bei Sonderkategorien.
 */
import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";
process.env.META_AD_ACCOUNT_ID = "act_1";
process.env.META_PAGE_ID = "page_1";

const { graph, launch, actId } = await import("./meta");

test("Konto-IDs bekommen das act_-Präfix, doppelt aber nicht", () => {
  expect(actId("61593202229799")).toBe("act_61593202229799");
  expect(actId("act_61593202229799")).toBe("act_61593202229799");
  expect(actId("")).toBe("");
});

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

test("Objekte werden als JSON serialisiert, Token gesetzt", async () => {
  const calls = stub(() => ({ ok: 1 }));
  await graph("act_1/campaigns", {
    method: "POST",
    params: { targeting: { age_min: 25 }, name: "X" },
  });
  expect(calls[0].searchParams.get("targeting")).toBe('{"age_min":25}');
  expect(calls[0].searchParams.get("access_token")).toBe("TEST");
});

test("Fehler der Graph API werfen die Meta-Nachricht", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "Invalid parameter" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
  expect(graph("x")).rejects.toThrow("Invalid parameter");
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
