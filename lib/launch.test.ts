import { expect, test } from "bun:test";
import { buildCreative } from "./launch";

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
