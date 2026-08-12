import { expect, test } from "bun:test";
import { buildCreative, launch } from "./launch";

const input = {
  pageId: "1189746767562744",
  instagramUserId: "17841436659257779",
  videoId: "1675767910156250",
  thumbnailUrl: "https://example.test/t.jpg",
  formId: "2095967427699237",
  bodies: ["b1", "b2", "b3", "b4", "b5"],
  titles: ["t1", "t2", "t3", "t4", "t5"],
  description: "d1",
};

test("the lead form hangs off the story spec, not the feed spec", () => {
  const c = buildCreative(input);
  expect(c.object_story_spec.video_data.call_to_action).toEqual({
    type: "APPLY_NOW",
    value: { lead_gen_form_id: "2095967427699237", link: "http://fb.me/" },
  });
  expect("onsite_destinations" in c.asset_feed_spec).toBe(false);
  expect("ad_formats" in c.asset_feed_spec).toBe(false);
  expect("call_to_action_types" in c.asset_feed_spec).toBe(false);
  expect("link_urls" in c.asset_feed_spec).toBe(false);
});

test("the feed spec carries only text variants", () => {
  const c = buildCreative(input);
  expect(c.asset_feed_spec.bodies).toEqual(input.bodies.map((text) => ({ text })));
  expect(c.asset_feed_spec.titles).toHaveLength(5);
  expect(c.asset_feed_spec.descriptions).toEqual([{ text: "d1" }]);
});

test("instagram uses the current field name", () => {
  const c = buildCreative(input);
  expect(c.object_story_spec.instagram_user_id).toBe("17841436659257779");
  expect("instagram_actor_id" in c.object_story_spec).toBe(false);
});

test("more than five bodies or titles is rejected", () => {
  expect(() => buildCreative({ ...input, bodies: Array(6).fill("x") })).toThrow(/5/);
  expect(() => buildCreative({ ...input, titles: Array(6).fill("x") })).toThrow(/5/);
});

test("at least one body and one title are required", () => {
  expect(() => buildCreative({ ...input, bodies: [] })).toThrow(/at least one/i);
  expect(() => buildCreative({ ...input, titles: [] })).toThrow(/at least one/i);
});

test("a lead form id is required", () => {
  expect(() => buildCreative({ ...input, formId: "" })).toThrow();
});

test("standard enhancements stay opted out", () => {
  const c = buildCreative(input);
  expect(
    c.degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status,
  ).toBe("OPT_OUT");
});

function fakeGraph(fail?: (path: string, n: number) => boolean) {
  let n = 0;
  const calls: { path: string; params: any }[] = [];
  // Generisch wie `graph()` selbst getypt, sonst weist TS die Fake-Funktion
  // wegen `<T>` nicht als `LaunchDeps["graph"]` zu (Laufzeitverhalten bleibt gleich).
  const g = async <T = any>(path: string, opts: any = {}): Promise<T> => {
    n++;
    calls.push({ path, params: opts.params });
    if (fail?.(path, n)) throw new Error("boom");
    return { id: `${path.split("/").pop()}-${n}` } as T;
  };
  return { g, calls };
}

const oneAdSet = {
  adAccount: "act_1",
  pageId: "p1",
  campaignName: "Kunde - ges. PFK ab 01.01.2026 AB",
  dailyBudgetCents: 1700,
  adSets: [
    {
      name: "Ads",
      addressString: "Hauptstr. 1, Dresden",
      radiusKm: 17,
      formId: "f1",
      bodies: ["b"],
      titles: ["t"],
      description: "d",
      videos: [
        { videoId: "v1", fileName: "a.mp4" },
        { videoId: "v2", fileName: "b.mp4" },
      ],
    },
  ],
};

test("the campaign is paused while ad sets and ads go live", async () => {
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  const campaign = calls.find((c) => c.path.endsWith("/campaigns"))!;
  expect(campaign.params.status).toBe("PAUSED");
  expect(campaign.params.special_ad_categories).toEqual(["EMPLOYMENT"]);
  expect(calls.find((c) => c.path.endsWith("/adsets"))!.params.status).toBe("ACTIVE");
  expect(calls.find((c) => c.path.endsWith("/ads"))!.params.status).toBe("ACTIVE");
});

test("the budget sits on the campaign, not the ad set", async () => {
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  expect(calls.find((c) => c.path.endsWith("/campaigns"))!.params.daily_budget).toBe(1700);
  expect(calls.find((c) => c.path.endsWith("/adsets"))!.params.daily_budget).toBeUndefined();
});

test("the ad set carries the lead form destination", async () => {
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  const set = calls.find((c) => c.path.endsWith("/adsets"))!.params;
  expect(set.destination_type).toBe("ON_AD");
  expect(set.optimization_goal).toBe("LEAD_GENERATION");
  expect(set.promoted_object).toEqual({ page_id: "p1" });
});

test("one ad per video", async () => {
  const { g } = fakeGraph();
  const r = await launch(oneAdSet, { graph: g });
  expect(r.adSets[0].adIds).toHaveLength(2);
  expect(r.failed).toHaveLength(0);
});

test("a failing ad is recorded without losing the ids already created", async () => {
  // 1 campaign, 2 adset, 3 creative, 4 ad, 5 creative, 6 ad -> fail the last
  const { g } = fakeGraph((path, n) => path.endsWith("/ads") && n === 6);
  const r = await launch(oneAdSet, { graph: g });
  expect(r.campaignId).toBeTruthy();
  expect(r.adSets[0].adIds).toHaveLength(1);
  expect(r.failed).toEqual([
    { adSetName: "Ads", fileName: "b.mp4", error: "boom" },
  ]);
});

test("a retry reuses the existing campaign instead of creating a second", async () => {
  const { g, calls } = fakeGraph();
  await launch({ ...oneAdSet, existingCampaignId: "c9" }, { graph: g });
  expect(calls.some((c) => c.path.endsWith("/campaigns"))).toBe(false);
  expect(calls.find((c) => c.path.endsWith("/adsets"))!.params.campaign_id).toBe("c9");
});

test("the spend cap is only sent when set", async () => {
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  expect(calls[0].params.spend_cap).toBeUndefined();

  const second = fakeGraph();
  await launch({ ...oneAdSet, spendCapCents: 20000 }, { graph: second.g });
  expect(second.calls[0].params.spend_cap).toBe(20000);
});

const twoAdSets = {
  ...oneAdSet,
  adSets: [
    oneAdSet.adSets[0],
    {
      name: "Ads – Dresden",
      addressString: "Bahnhofstr. 2, Dresden",
      radiusKm: 10,
      formId: "f2",
      bodies: ["b2"],
      titles: ["t2"],
      description: "d2",
      videos: [{ videoId: "v3", fileName: "c.mp4" }],
    },
  ],
};

test("a failing ad set does not stop the remaining ad sets from being created", async () => {
  // 1 campaign, 2 adsets (first ad set) -> fail here, then 3 adsets (second ad set), 4 creative, 5 ads
  const { g } = fakeGraph((path, n) => path.endsWith("/adsets") && n === 2);
  const r = await launch(twoAdSets, { graph: g });
  expect(r.campaignId).toBeTruthy();
  expect(r.adSets[0].error).toBeTruthy();
  expect(r.adSets[0].adIds).toHaveLength(0);
  expect(r.adSets[1].id).toBeTruthy();
  expect(r.adSets[1].adIds).toHaveLength(1);
});
