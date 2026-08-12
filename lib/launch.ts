/**
 * Anlegen einer Kampagne nach dem Standardablauf der Agentur.
 * Die Creative-Form ist aus laufenden Kampagnen abgelesen, nicht aus der Doku:
 * asset_feed_spec trägt nur Text, object_story_spec Video und Formular –
 * beide zusammen in einem Creative. onsite_destinations wird nicht benutzt.
 */
export type CreativeInput = {
  pageId: string;
  instagramUserId?: string;
  videoId: string;
  thumbnailHash?: string;
  thumbnailUrl?: string;
  formId: string;
  bodies: string[];
  titles: string[];
  description: string;
  callToAction?: string;
};

export function buildCreative(i: CreativeInput) {
  if (!i.bodies.length || !i.titles.length)
    throw new Error("At least one primary text and one headline are required.");
  if (i.bodies.length > 5 || i.titles.length > 5)
    throw new Error("Meta allows at most 5 primary texts and 5 headlines.");
  if (!i.formId) throw new Error("A lead form must be selected.");

  return {
    object_story_spec: {
      page_id: i.pageId,
      ...(i.instagramUserId ? { instagram_user_id: i.instagramUserId } : {}),
      video_data: {
        video_id: i.videoId,
        ...(i.thumbnailHash
          ? { image_hash: i.thumbnailHash }
          : { image_url: i.thumbnailUrl }),
        call_to_action: {
          type: i.callToAction ?? "APPLY_NOW",
          // link ist bei Lead-Ads ein Platzhalter – Meta verlangt ihn trotzdem.
          value: { lead_gen_form_id: i.formId, link: "http://fb.me/" },
        },
      },
    },
    asset_feed_spec: {
      bodies: i.bodies.map((text) => ({ text })),
      titles: i.titles.map((text) => ({ text })),
      descriptions: [{ text: i.description }],
    },
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: { enroll_status: "OPT_OUT" },
      },
    },
  };
}
