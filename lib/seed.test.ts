import { expect, test } from "bun:test";
import { seedFromCampaign } from "./seed";

test("seedFromCampaign", () => {
  const raw = {
    id: "camp_1",
    name: "My Campaign",
    status: "ACTIVE",
    daily_budget: "1000",
    spend_cap: "50000",
    adsets: {
      data: [
        {
          id: "set_1",
          name: "UGC Set",
          status: "ACTIVE",
          promoted_object: { page_id: "page_1" },
          targeting: {
            geo_locations: {
              custom_locations: [{ address_string: "Berlin", radius: 20 }]
            }
          },
          ads: {
            data: [
              {
                id: "ad_1",
                name: "UGC Ad",
                status: "ACTIVE",
                creative: {
                  object_story_spec: {
                    video_data: {
                      video_id: "vid_1",
                      image_url: "thumb.jpg",
                      message: "Fallback Body",
                      title: "Fallback Title",
                      call_to_action: { value: { lead_gen_form_id: "form_1" } }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          id: "set_2",
          name: "Split Set",
          status: "ACTIVE",
          targeting: {
            geo_locations: {
              cities: [{ key: "city_1", name: "Hamburg", radius: 17 }]
            }
          },
          ads: {
            data: [
              {
                id: "ad_2",
                name: "Split Ad",
                status: "ACTIVE",
                creative: {
                  asset_feed_spec: {
                    bodies: [{ text: "Body 1" }, { text: "Body 2" }],
                    titles: [{ text: "Title 1" }],
                    descriptions: [{ text: "Desc 1" }],
                    call_to_actions: [{ value: { lead_gen_form_id: "form_2" } }],
                    videos: [{ video_id: "vid_2", adlabels: [{ name: "portrait_lbl" }] }],
                    images: [{ hash: "img_hash", adlabels: [{ name: "square_lbl" }] }],
                    asset_customization_rules: [
                      { priority: 1, video_label: { name: "portrait_lbl" } },
                      { priority: 2, image_label: { name: "square_lbl" } }
                    ]
                  }
                }
              },
              {
                id: "ad_3",
                name: "Single Ad",
                status: "ACTIVE",
                creative: {
                  object_story_spec: {
                    link_data: {
                      image_hash: "single_hash",
                      message: "Single Body",
                      call_to_action: { value: { lead_gen_form_id: "form_2" } }
                    }
                  }
                }
              },
              {
                // Ads-Manager-Form: drei Regeln, Story+Feed teilen sich ein Video,
                // die dritte (ohne Platzierung) trägt das zweite. Priorität 2
                // steht absichtlich vorn.
                id: "ad_pair",
                name: "Video Pair",
                status: "ACTIVE",
                creative: {
                  asset_feed_spec: {
                    bodies: [{ text: "B" }],
                    titles: [{ text: "T" }],
                    videos: [
                      { video_id: "vid_rest", thumbnail_url: "b.jpg", adlabels: [{ name: "rest" }] },
                      { video_id: "vid_story", thumbnail_url: "a.jpg", adlabels: [{ name: "story" }, { name: "feed" }] },
                    ],
                    asset_customization_rules: [
                      { priority: 2, video_label: { name: "feed" }, customization_spec: { facebook_positions: ["feed"] } },
                      { priority: 1, video_label: { name: "story" }, customization_spec: { facebook_positions: ["story", "facebook_reels"], instagram_positions: ["story", "reels"] } },
                      { priority: 3, video_label: { name: "rest" }, customization_spec: {} },
                    ],
                  },
                },
              },
              {
                // Ein Video in allen Regeln: kein Paar, ein UGC-Video.
                id: "ad_one",
                name: "One Video",
                status: "ACTIVE",
                creative: {
                  asset_feed_spec: {
                    videos: [{ video_id: "vid_only", adlabels: [{ name: "x" }, { name: "y" }] }],
                    asset_customization_rules: [
                      { priority: 1, video_label: { name: "x" }, customization_spec: { facebook_positions: ["story"] } },
                      { priority: 2, video_label: { name: "y" }, customization_spec: {} },
                    ],
                  },
                },
              },
              {
                id: "ad_4",
                name: "Carousel Ad",
                status: "ACTIVE",
                creative: {
                  object_story_spec: {
                    link_data: {
                      child_attachments: [{}]
                    }
                  }
                }
              }
            ]
          }
        },
        {
          id: "set_3",
          name: "Missing Form",
          status: "ACTIVE",
          targeting: {},
          ads: {
            data: [
              {
                id: "ad_5",
                name: "Broken Ad",
                status: "ACTIVE",
                creative: {
                  object_story_spec: {
                    video_data: { video_id: "vid_broken" }
                  }
                }
              }
            ]
          }
        }
      ]
    }
  };

  const seed = seedFromCampaign(raw);

  expect(seed.campaignId).toBe("camp_1");
  expect(seed.name).toBe("My Campaign");
  expect(seed.status).toBe("ACTIVE");
  expect(seed.dailyBudgetEuros).toBe(10);
  expect(seed.spendCapEuros).toBe(500);
  expect(seed.pageId).toBe("page_1");

  expect(seed.warnings).toEqual([
    "„Split Set“: Anzeige „Carousel Ad“ hat kein Format, das der Assistent kennt – nicht übernommen.",
    "„Missing Form“: kein Lead-Formular gefunden – bitte wählen."
  ]);

  expect(seed.adSets).toHaveLength(3);

  const set1 = seed.adSets[0];
  expect(set1.metaId).toBe("set_1");
  expect(set1.name).toBe("UGC Set");
  expect(set1.addressString).toBe("Berlin");
  expect(set1.radiusKm).toBe(20);
  expect(set1.formId).toBe("form_1");
  expect(set1.bodies).toEqual(["Fallback Body"]);
  expect(set1.titles).toEqual(["Fallback Title"]);
  expect(set1.ads).toHaveLength(1);
  expect(set1.ads[0]).toEqual({
    metaId: "ad_1",
    name: "UGC Ad",
    type: "ugc",
    asset: { kind: "video", videoId: "vid_1", thumbnailUrl: "thumb.jpg", fileName: "UGC Ad" }
  });

  const set2 = seed.adSets[1];
  expect(set2.metaId).toBe("set_2");
  expect(set2.place).toEqual({ type: "city", key: "city_1", name: "Hamburg" });
  expect(set2.radiusKm).toBe(17);
  expect(set2.formId).toBe("form_2");
  expect(set2.bodies).toEqual(["Body 1", "Body 2"]);
  expect(set2.titles).toEqual(["Title 1"]);
  expect(set2.description).toBe("Desc 1");
  expect(set2.ads).toHaveLength(4);
  expect(set2.ads[0]).toEqual({
    metaId: "ad_2",
    name: "Split Ad",
    type: "split",
    portrait: { kind: "video", videoId: "vid_2", thumbnailUrl: undefined, fileName: "Split Ad" },
    square: { kind: "image", hash: "img_hash", fileName: "Split Ad" }
  });
  expect(set2.ads[1]).toEqual({
    metaId: "ad_3",
    name: "Single Ad",
    type: "single",
    asset: { kind: "image", hash: "single_hash", fileName: "Single Ad" }
  });
  expect(set2.ads[2]).toEqual({
    metaId: "ad_pair",
    name: "Video Pair",
    type: "split",
    portrait: { kind: "video", videoId: "vid_story", thumbnailUrl: "a.jpg", fileName: "Video Pair" },
    square: { kind: "video", videoId: "vid_rest", thumbnailUrl: "b.jpg", fileName: "Video Pair" }
  });
  expect(set2.ads[3]).toEqual({
    metaId: "ad_one",
    name: "One Video",
    type: "ugc",
    asset: { kind: "video", videoId: "vid_only", thumbnailUrl: undefined, fileName: "One Video" }
  });

  const set3 = seed.adSets[2];
  expect(set3.metaId).toBe("set_3");
  expect(set3.formId).toBe("");
  expect(set3.ads).toHaveLength(1);
});
