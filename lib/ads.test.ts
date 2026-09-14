import { expect, test } from "bun:test";
import { creativeFromSibling } from "./ads";

const sibling = {
  object_story_spec: {
    page_id: "p1",
    instagram_user_id: "ig1",
    video_data: { video_id: "v0", call_to_action: { type: "APPLY_NOW", value: { lead_gen_form_id: "f1" } } },
  },
  asset_feed_spec: { bodies: [{ text: "A" }, { text: "B" }], titles: [{ text: "T" }], descriptions: [{ text: "D" }] },
};

test("neue Anzeige erbt Seite, Instagram, Formular und Texte der Geschwister", () => {
  const p = creativeFromSibling(sibling, { name: "Neu", asset: { kind: "image", hash: "h1", fileName: "neu.jpg" } }) as any;
  expect(p.object_story_spec.page_id).toBe("p1");
  expect(p.object_story_spec.instagram_user_id).toBe("ig1");
  expect(p.object_story_spec.link_data.image_hash).toBe("h1");
  expect(p.object_story_spec.link_data.call_to_action.value.lead_gen_form_id).toBe("f1");
  expect(p.asset_feed_spec.bodies.map((b: any) => b.text)).toEqual(["A", "B"]);
});

test("ohne Geschwister gibt es nichts zu erben", () => {
  expect(() => creativeFromSibling(undefined, { name: "Neu", asset: { kind: "image", hash: "h", fileName: "x" } })).toThrow();
});
