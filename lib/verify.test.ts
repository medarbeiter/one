import { expect, test } from "bun:test";
import { checkCampaign } from "./verify";

const intent = { formIds: { Ads: "f1" }, radiusKm: { Ads: 17 }, adCount: 2 };

const good = {
  status: "PAUSED",
  adsets: {
    data: [
      {
        name: "Ads",
        status: "ACTIVE",
        targeting: {
          geo_locations: { custom_locations: [{ radius: 17 }] },
          facebook_positions: ["feed", "story"],
          instagram_positions: ["stream", "story"],
        },
        ads: {
          data: [
            { name: "a", status: "ACTIVE", creative: { object_story_spec: { video_data: { call_to_action: { value: { lead_gen_form_id: "f1" } } } } } },
            { name: "b", status: "ACTIVE", creative: { object_story_spec: { video_data: { call_to_action: { value: { lead_gen_form_id: "f1" } } } } } },
          ],
        },
      },
    ],
  },
};

test("a correctly built campaign passes every check", () => {
  const checks = checkCampaign(good as any, intent);
  expect(checks.every((c) => c.ok)).toBe(true);
});

test("an ad pointing at the wrong form fails the form check", () => {
  const bad = structuredClone(good);
  bad.adsets.data[0].ads.data[1].creative.object_story_spec.video_data.call_to_action.value.lead_gen_form_id = "WRONG";
  const check = checkCampaign(bad as any, intent).find((c) => c.label.includes("form"))!;
  expect(check.ok).toBe(false);
  expect(check.detail).toContain("b");
});

test("a live campaign fails the paused check", () => {
  const bad = { ...structuredClone(good), status: "ACTIVE" };
  expect(checkCampaign(bad as any, intent).find((c) => c.label.includes("paused"))!.ok).toBe(false);
});

test("a missing ad is caught by the count check", () => {
  const bad = structuredClone(good);
  bad.adsets.data[0].ads.data.pop();
  expect(checkCampaign(bad as any, intent).find((c) => c.label.includes("ads"))!.ok).toBe(false);
});

test("extra placements fail the placement check", () => {
  const bad = structuredClone(good);
  bad.adsets.data[0].targeting.facebook_positions.push("marketplace");
  expect(checkCampaign(bad as any, intent).find((c) => c.label.includes("Placements"))!.ok).toBe(false);
});

test("two ad sets with different radii both pass when each matches its own intent", () => {
  const twoSets = structuredClone(good);
  const second = structuredClone(good.adsets.data[0]);
  second.name = "More Ads";
  second.targeting.geo_locations.custom_locations[0].radius = 30;
  twoSets.adsets.data.push(second);
  const twoIntent = {
    formIds: { Ads: "f1", "More Ads": "f1" },
    radiusKm: { Ads: 17, "More Ads": 30 },
    adCount: 4,
  };
  const check = checkCampaign(twoSets as any, twoIntent).find((c) => c.label.includes("Radius"))!;
  expect(check.ok).toBe(true);
});
