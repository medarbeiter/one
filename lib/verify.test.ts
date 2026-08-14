import { expect, test } from "bun:test";
import { geoLocations } from "./geo";
import { checkCampaign } from "./verify";

const address = geoLocations({ addressString: "Hauptstr. 1, Dresden", radiusKm: 17 });
const intent = { formIds: { Ads: "f1" }, geo: { Ads: address }, adCount: 2 };

const ugcAd = (name: string, formId = "f1") => ({
  name,
  status: "ACTIVE",
  creative: {
    object_story_spec: {
      video_data: { call_to_action: { value: { lead_gen_form_id: formId } } },
    },
  },
});

/** Eine Split-Anzeige so, wie Meta sie zurückliest – inklusive der age-Felder,
 *  die Meta selbst in die Auffangregel einsetzt. */
const splitAd = (name = "Creative 1", formId = "f1") => ({
  name,
  status: "ACTIVE",
  creative: {
    object_story_spec: { page_id: "p1", instagram_user_id: "ig1" },
    asset_feed_spec: {
      images: [
        { hash: "hp", adlabels: [{ name: "Lp" }] },
        { hash: "hs", adlabels: [{ name: "Ls" }] },
      ],
      call_to_actions: [{ type: "APPLY_NOW", value: { lead_gen_form_id: formId } }],
      optimization_type: "PLACEMENT",
      asset_customization_rules: [
        {
          priority: 1,
          customization_spec: {
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["story", "facebook_reels"],
            instagram_positions: ["story", "reels"],
          },
          image_label: { name: "Lp" },
        },
        {
          priority: 2,
          customization_spec: { age_min: 13, age_max: 65 },
          image_label: { name: "Ls" },
        },
      ],
    },
  },
});

const adSet = (ads: unknown[]) => ({
  name: "Ads",
  status: "ACTIVE",
  targeting: {
    // So liest Meta eine Adresse zurück: umgeschriebener Text, eigene
    // Koordinaten, unser Radius.
    geo_locations: {
      custom_locations: [
        {
          address_string: "1 Hauptstraße, Dresden, Sachsen, Deutschland",
          latitude: 51.04529,
          longitude: 13.7751,
          radius: 17,
          distance_unit: "kilometer",
        },
      ],
      location_types: ["home", "recent"],
    },
    facebook_positions: ["feed", "story", "facebook_reels", "profile_feed"],
    instagram_positions: ["stream", "story", "reels", "profile_feed"],
  },
  ads: { data: ads },
});

const good = { status: "PAUSED", adsets: { data: [adSet([ugcAd("a"), ugcAd("b")])] } };

const find = (tree: any, intentIn: any, needle: string) =>
  checkCampaign(tree, intentIn).find((c) => c.label.includes(needle))!;

test("a correctly built campaign passes every check", () => {
  expect(checkCampaign(good as any, intent).every((c) => c.ok)).toBe(true);
});

test("an ad pointing at the wrong form fails the form check", () => {
  const bad = { status: "PAUSED", adsets: { data: [adSet([ugcAd("a"), ugcAd("b", "WRONG")])] } };
  const check = find(bad, intent, "Lead-Formular");
  expect(check.ok).toBe(false);
  expect(check.detail).toContain("b");
});

test("a live campaign fails the paused check", () => {
  expect(find({ ...good, status: "ACTIVE" }, intent, "pausiert").ok).toBe(false);
});

test("a missing ad is caught by the count check", () => {
  const bad = { status: "PAUSED", adsets: { data: [adSet([ugcAd("a")])] } };
  expect(find(bad, intent, "Anzeigen erstellt").ok).toBe(false);
});

test("extra placements fail the placement check", () => {
  const bad = structuredClone(good);
  bad.adsets.data[0].targeting.facebook_positions.push("marketplace");
  expect(find(bad, intent, "Platzierungen").ok).toBe(false);
});

test("the old feed-and-stories-only placements now fail", () => {
  // Ohne Reels hätte die Hochformat-Hälfte einer Split-Anzeige keinen Platz.
  const bad = structuredClone(good);
  bad.adsets.data[0].targeting.facebook_positions = ["feed", "story"];
  bad.adsets.data[0].targeting.instagram_positions = ["stream", "story"];
  expect(find(bad, intent, "Platzierungen").ok).toBe(false);
});

test("two ad sets with different radii both pass when each matches its own intent", () => {
  const twoSets = structuredClone(good);
  const second = structuredClone(good.adsets.data[0]);
  second.name = "More Ads";
  second.targeting.geo_locations.custom_locations[0].radius = 30;
  twoSets.adsets.data.push(second);
  const twoIntent = {
    formIds: { Ads: "f1", "More Ads": "f1" },
    geo: {
      Ads: address,
      "More Ads": geoLocations({ addressString: "Hauptstr. 1, Dresden", radiusKm: 30 }),
    },
    adCount: 4,
  };
  expect(find(twoSets, twoIntent, "Standort").ok).toBe(true);
});

test("eine stadtweite Anzeigengruppe trägt ihren Radius in einem anderen Topf", () => {
  // Vorher las die Prüfung nur custom_locations – jede Anzeigengruppe, die auf
  // eine Stadt zielt, fiel mit "Radius stimmt nicht" durch, obwohl ihrer stimmt.
  const city = structuredClone(good) as any;
  city.adsets.data[0].targeting.geo_locations = {
    cities: [{ key: "560419", name: "Hamburg", radius: 17 }],
  } as any;
  const cityIntent = {
    ...intent,
    geo: {
      Ads: geoLocations({
        addressString: "",
        radiusKm: 17,
        place: { type: "city" as const, key: "560419", name: "Hamburg" },
      }),
    },
  };
  expect(find(city, cityIntent, "Standort").ok).toBe(true);
  // Eine andere Stadt als geplant ist kein Detail: die Kampagne liefe am
  // falschen Ende der Republik.
  city.adsets.data[0].targeting.geo_locations.cities[0].key = "573831";
  expect(find(city, cityIntent, "Standort").ok).toBe(false);
});

test("ein Ort ohne Radius erwartet auch keinen", () => {
  // Eine PLZ nimmt bei Meta keinen Radius an. „Kein Radius“ ist dort das
  // richtige Ergebnis und darf nicht als Abweichung von 17 km gelten.
  const zip = structuredClone(good);
  zip.adsets.data[0].targeting.geo_locations = { zips: [{ key: "DE:20095" }] } as any;
  const zipIntent = {
    ...intent,
    geo: {
      Ads: geoLocations({
        addressString: "",
        radiusKm: 17,
        place: { type: "zip" as const, key: "DE:20095", name: "20095" },
      }),
    },
  };
  expect(find(zip, zipIntent, "Standort").ok).toBe(true);
  // Und umgekehrt: erwartet der Plan eine Adresse, steht dort aber eine PLZ,
  // fällt es auf.
  expect(find(zip, intent, "Standort").ok).toBe(false);
});

test("eine nicht geocodierte Adresse fällt durch, obwohl der Radius stimmt", () => {
  // Der teuerste stille Fall: Meta nimmt die Anzeigengruppe an, findet die
  // Adresse aber nicht – geliefert wird dann an niemanden, und im Ads Manager
  // sieht die Gruppe normal aus.
  const lost = structuredClone(good);
  delete (lost.adsets.data[0].targeting.geo_locations.custom_locations[0] as any).latitude;
  const check = find(lost, intent, "Standort");
  expect(check.ok).toBe(false);
  expect(check.detail).toContain("Koordinaten");
});

test("ein Topf zu viel im Targeting fällt auf", () => {
  // countries: ["DE"] neben der Adresse streut das Budget über die Republik.
  const extra = structuredClone(good) as any;
  extra.adsets.data[0].targeting.geo_locations.countries = ["DE"];
  const check = find(extra, intent, "Standort");
  expect(check.ok).toBe(false);
  expect(check.detail).toContain("countries");
});

// ------------------------------------------------------------------- splits

test("a split ad's lead form is found in the asset feed spec", () => {
  // Vorher suchte die Prüfung nur im object_story_spec – jede Split-Anzeige
  // wäre mit "falsches Formular" durchgefallen, obwohl ihres stimmt.
  const tree = { status: "PAUSED", adsets: { data: [adSet([ugcAd("a"), splitAd()])] } };
  expect(find(tree, intent, "Lead-Formular").ok).toBe(true);
  expect(checkCampaign(tree as any, intent).every((c) => c.ok)).toBe(true);
});

test("a split ad pointing at the wrong form is still caught", () => {
  const tree = {
    status: "PAUSED",
    adsets: { data: [adSet([ugcAd("a"), splitAd("Creative 1", "WRONG")])] },
  };
  const check = find(tree, intent, "Lead-Formular");
  expect(check.ok).toBe(false);
  expect(check.detail).toContain("Creative 1");
});

test("a rule whose label matches no asset fails the split check", () => {
  const tree = { status: "PAUSED", adsets: { data: [adSet([ugcAd("a"), splitAd()])] } } as any;
  tree.adsets.data[0].ads.data[1].creative.asset_feed_spec.asset_customization_rules[1].image_label.name =
    "Lmissing";
  const check = find(tree, intent, "gebunden");
  expect(check.ok).toBe(false);
  expect(check.detail).toContain("Lmissing");
});

test("a split with only one rule fails the split check", () => {
  const tree = { status: "PAUSED", adsets: { data: [adSet([ugcAd("a"), splitAd()])] } } as any;
  tree.adsets.data[0].ads.data[1].creative.asset_feed_spec.asset_customization_rules.pop();
  expect(find(tree, intent, "gebunden").ok).toBe(false);
});

test("a split without a catch-all rule fails, because a placement would go unserved", () => {
  const tree = { status: "PAUSED", adsets: { data: [adSet([ugcAd("a"), splitAd()])] } } as any;
  tree.adsets.data[0].ads.data[1].creative.asset_feed_spec.asset_customization_rules[1].customization_spec =
    { facebook_positions: ["feed"], instagram_positions: ["stream"] };
  const check = find(tree, intent, "gebunden");
  expect(check.ok).toBe(false);
  expect(check.detail).toContain("Auffangregel");
});

test("a split with no stories-and-reels rule fails", () => {
  const tree = { status: "PAUSED", adsets: { data: [adSet([ugcAd("a"), splitAd()])] } } as any;
  tree.adsets.data[0].ads.data[1].creative.asset_feed_spec.asset_customization_rules[0].customization_spec.facebook_positions =
    ["feed"];
  expect(find(tree, intent, "gebunden").ok).toBe(false);
});

test("limited spending on excluded placements is caught if it ever appears", () => {
  const bad = structuredClone(good) as any;
  bad.adsets.data[0].placement_soft_opt_out = { facebook_positions: ["marketplace"] };
  const check = find(bad, intent, "eingeschränkten Ausgaben");
  expect(check.ok).toBe(false);
  expect(check.detail).toContain("Ads");
});
