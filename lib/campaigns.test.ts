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

const { results, costPerResult, launch, listCampaigns, pickInsights } = await import("./campaigns");
type Customer = Parameters<typeof listCampaigns>[0][number];

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

test("Nur Leads sind Ergebnisse – Klicks und Interaktionen zählen nicht", () => {
  expect(results({ actions: [a("post_engagement", "90"), a("lead", "3")] })).toBe(3);
  expect(results({ actions: [a("post_engagement", "90"), a("link_click", "12")] })).toBeUndefined();
  expect(results({ actions: [a("landing_page_view", "40"), a("link_click", "12")] })).toBeUndefined();
});

test("Vier Zeiträume kommen als Aliasse und werden zur Karte", () => {
  const raw = { i_heute: { data: [{ spend: "1" }] }, i_gesamt: { data: [{ spend: "9" }] }, i_woche: { data: [] } };
  expect(pickInsights(raw)).toEqual({ today: { spend: "1" }, maximum: { spend: "9" } });
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

// Ein Werbekonto kann mehreren Kunden gehören: MedArbeiter zahlt über dasselbe
// Konto auch für die Seite "Jobs - MedArbeiter". Wird je Kunde statt je Konto
// abgefragt, steht jede Kampagne dieses Kontos doppelt in der Tabelle.
test("Geteiltes Konto: jede Kampagne genau einmal, ein Sub-Request", async () => {
  const calls = stub((url) => {
    const reqs = JSON.parse(url.searchParams.get("batch")!) as { relative_url: string }[];
    return reqs.map((r) => ({
      code: 200,
      body: JSON.stringify({
        data: [{ id: `camp_${r.relative_url.split("/")[0]}`, name: "K", status: "ACTIVE" }],
      }),
    }));
  });

  const shared = { id: "act_shared", name: "Shared", account_status: 1, currency: "EUR", access: "own" } as const;
  const customer = (id: string, name: string): Customer => ({
    source: id,
    id,
    name,
    adAccounts: [shared],
    access: "own",
    issues: [],
  });

  const { campaigns } = await listCampaigns(
    [customer("medarbeiter", "MedArbeiter"), customer("jobsmedarbeiter", "Jobs - MedArbeiter")],
  );

  expect(campaigns.map((c) => c.id)).toEqual(["camp_act_shared"]);
  expect(JSON.parse(calls[0].searchParams.get("batch")!)).toHaveLength(1);
  // Beide Kunden zahlen dafür – einen davon zu verschweigen wäre erfunden.
  expect(campaigns[0].customerName).toBe("MedArbeiter, Jobs - MedArbeiter");
});

test("Getrennte Konten bleiben getrennt zugeordnet", async () => {
  stub((url) => {
    const reqs = JSON.parse(url.searchParams.get("batch")!) as { relative_url: string }[];
    return reqs.map((r) => ({
      code: 200,
      body: JSON.stringify({ data: [{ id: `camp_${r.relative_url.split("/")[0]}` }] }),
    }));
  });

  const acct = (id: string) => ({ id, name: id, account_status: 1, currency: "EUR", access: "own" as const });
  const { campaigns } = await listCampaigns(
    [
      { source: "a", id: "a", name: "Kunde A", adAccounts: [acct("act_a")], access: "own", issues: [] },
      { source: "b", id: "b", name: "Kunde B", adAccounts: [acct("act_b")], access: "own", issues: [] },
    ],
  );

  expect(campaigns.map((c) => [c.id, c.customerName])).toEqual([
    ["camp_act_a", "Kunde A"],
    ["camp_act_b", "Kunde B"],
  ]);
});

// Ohne Suchwort holt limit=100 nur die erste Seite je Konto – ein Konto mit
// mehr Kampagnen (der gemeinsame Zahler) verliert dann ältere. Mit Suchwort
// muss Graph selbst über den ganzen Bestand filtern, nicht die erste Seite.
test("Suchwort landet als filtering-Parameter im Sub-Request", async () => {
  const calls = stub((url) => {
    const reqs = JSON.parse(url.searchParams.get("batch")!) as { relative_url: string }[];
    return reqs.map(() => ({ code: 200, body: JSON.stringify({ data: [] }) }));
  });

  const acct = { id: "act_x", name: "X", account_status: 1, currency: "EUR", access: "own" as const };
  await listCampaigns(
    [{ source: "x", id: "x", name: "Kunde X", adAccounts: [acct], access: "own", issues: [] }],
    "Obermain",
  );

  const [{ relative_url }] = JSON.parse(calls[0].searchParams.get("batch")!) as { relative_url: string }[];
  const filtering = JSON.parse(new URLSearchParams(relative_url.split("?")[1]).get("filtering")!);
  expect(filtering).toEqual([{ field: "name", operator: "CONTAIN", value: "Obermain" }]);
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

test("sumInsights: Summen, Quoten neu gerechnet", async () => {
  const { sumInsights, results: r } = await import("./campaigns");
  const s = sumInsights([
    { spend: "100", impressions: "10000", reach: "5000", inline_link_clicks: "100", actions: [a("lead", "4")] },
    { spend: "50", impressions: "5000", reach: "2500", inline_link_clicks: "200", actions: [a("lead", "1")] },
    undefined,
  ]);
  expect(s.spend).toBe("150");
  expect(s.cpm).toBe("10");
  expect(s.inline_link_click_ctr).toBe("2");
  expect(s.frequency).toBe("2");
  expect(r(s)).toBe(5);
  expect(costPerResult(s)).toBe(30);
});
