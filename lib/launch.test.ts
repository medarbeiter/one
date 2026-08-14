import { expect, test } from "bun:test";
import {
  buildCreative,
  launch,
  launchSteps,
  type AdInput,
  type LaunchProgress,
} from "./launch";
import { GraphError, unwrapBatchItem } from "./graph";

const ugcAd: AdInput = {
  name: "Laura 1.mp4",
  type: "ugc",
  asset: {
    kind: "video",
    videoId: "1675767910156250",
    thumbnailUrl: "https://example.test/t.jpg",
    fileName: "Laura 1.mp4",
  },
};

const splitAd: AdInput = {
  name: "Creative 1",
  type: "split",
  portrait: { kind: "image", hash: "hash_p", fileName: "Creative 3.jpg" },
  square: { kind: "image", hash: "hash_s", fileName: "Creative 4.jpg" },
};

const singleAd: AdInput = {
  name: "Creative 1",
  type: "single",
  asset: { kind: "image", hash: "hash_one", fileName: "Team.jpg" },
};

const input = {
  pageId: "1189746767562744",
  instagramUserId: "17841436659257779",
  formId: "2095967427699237",
  bodies: ["b1", "b2", "b3", "b4", "b5"],
  titles: ["t1", "t2", "t3", "t4", "t5"],
  description: "d1",
  ad: ugcAd,
};

// ---------------------------------------------------------------- UGC creative

test("the lead form hangs off the story spec, not the feed spec", () => {
  const c = buildCreative(input) as any;
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
  const c = buildCreative(input) as any;
  expect(c.asset_feed_spec.bodies).toEqual(input.bodies.map((text) => ({ text })));
  expect(c.asset_feed_spec.titles).toHaveLength(5);
  expect(c.asset_feed_spec.descriptions).toEqual([{ text: "d1" }]);
});

test("instagram uses the current field name", () => {
  const c = buildCreative(input) as any;
  expect(c.object_story_spec.instagram_user_id).toBe("17841436659257779");
  expect("instagram_actor_id" in c.object_story_spec).toBe(false);
});

test("more than five bodies or titles is rejected", () => {
  expect(() => buildCreative({ ...input, bodies: Array(6).fill("x") })).toThrow(/5/);
  expect(() => buildCreative({ ...input, titles: Array(6).fill("x") })).toThrow(/5/);
});

test("at least one body and one title are required", () => {
  expect(() => buildCreative({ ...input, bodies: [] })).toThrow(/mindestens ein/i);
  expect(() => buildCreative({ ...input, titles: [] })).toThrow(/mindestens ein/i);
});

test("a lead form id is required", () => {
  expect(() => buildCreative({ ...input, formId: "" })).toThrow();
});

test("a single body and a single headline is rejected before Meta rejects it", () => {
  // Meta: "Anzeigen mit Gestaltungsfreiraum benötigen mindestens ein
  // Gestaltungsfreiraum-Feld mit mehr als einem Asset." Genau die Vorbelegung
  // des Assistenten (je ein Feld) lief in diesen Satz hinein.
  expect(() => buildCreative({ ...input, bodies: ["b"], titles: ["t"] })).toThrow(
    /mindestens zwei/i,
  );
  // Zwei in *einem* der beiden Felder reichen Meta.
  expect(() => buildCreative({ ...input, bodies: ["b1", "b2"], titles: ["t"] })).not.toThrow();
});

// ------------------------------------------------------------- Einzelnes Bild

/**
 * Nicht jedes Motiv gibt es in zwei Formaten. Vorher war ein einzelnes Bild ein
 * offener Zustand, der den ganzen Standort blockierte – jetzt ist es eine
 * Anzeige wie die anderen.
 */
test("ein einzelnes Bild hängt als link_data an der Story-Spec", () => {
  const c = buildCreative({ ...input, ad: singleAd }) as any;
  expect(c.object_story_spec.link_data.image_hash).toBe("hash_one");
  expect(c.object_story_spec.link_data.call_to_action).toEqual({
    type: "APPLY_NOW",
    value: { lead_gen_form_id: "2095967427699237", link: "http://fb.me/" },
  });
  // Wie bei UGC: das Format steht in der Story-Spec, der Feed trägt nur Text.
  expect(c.asset_feed_spec.optimization_type).toBe("DEGREES_OF_FREEDOM");
  expect("ad_formats" in c.asset_feed_spec).toBe(false);
  expect("images" in c.asset_feed_spec).toBe(false);
  expect("asset_customization_rules" in c.asset_feed_spec).toBe(false);
});

test("auch das Einzelbild braucht zwei Texte in einem Feld", () => {
  // Dieselbe Regel wie bei UGC – sie hängt an DEGREES_OF_FREEDOM, nicht am Medium.
  expect(() =>
    buildCreative({ ...input, ad: singleAd, bodies: ["b"], titles: ["t"] }),
  ).toThrow(/mindestens zwei/i);
  expect(() =>
    buildCreative({ ...input, ad: singleAd, bodies: ["b1", "b2"], titles: ["t"] }),
  ).not.toThrow();
});

test("the deprecated standard_enhancements field is never sent", () => {
  // Meta lehnt jede Anzeigengestaltung mit diesem Feld ab; die Einzelfeatures
  // tragen dieselbe Absicht.
  for (const ad of [ugcAd, singleAd, splitAd]) {
    const c = buildCreative({ ...input, ad }) as any;
    const features = c.degrees_of_freedom_spec.creative_features_spec;
    expect("standard_enhancements" in features).toBe(false);
    expect(features.advantage_plus_creative.enroll_status).toBe("OPT_OUT");
    expect(features.text_optimizations.enroll_status).toBe("OPT_OUT");
  }
});

test("der Asset Feed sagt Meta, dass nur Text variiert", () => {
  const c = buildCreative(input) as any;
  expect(c.asset_feed_spec.optimization_type).toBe("DEGREES_OF_FREEDOM");
  expect("ad_formats" in c.asset_feed_spec).toBe(false);
  expect("videos" in c.asset_feed_spec).toBe(false);
});

// -------------------------------------------------------------- Split creative

const split = () => buildCreative({ ...input, ad: splitAd }) as any;

test("a split ad keeps no media in the story spec", () => {
  const c = split();
  expect(c.object_story_spec).toEqual({
    page_id: "1189746767562744",
    instagram_user_id: "17841436659257779",
  });
  expect(c.asset_feed_spec.optimization_type).toBe("PLACEMENT");
});

test("a split ad carries its lead form inside the asset feed spec", () => {
  const c = split();
  expect(c.asset_feed_spec.call_to_actions).toEqual([
    { type: "APPLY_NOW", value: { lead_gen_form_id: "2095967427699237" } },
  ]);
  expect(c.asset_feed_spec.call_to_action_types).toEqual(["APPLY_NOW"]);
});

test("the portrait rule buys stories and reels, the square rule catches the rest", () => {
  const [portrait, square] = split().asset_feed_spec.asset_customization_rules;
  expect(portrait.customization_spec.facebook_positions).toEqual(["story", "facebook_reels"]);
  expect(portrait.customization_spec.instagram_positions).toEqual(["story", "reels"]);
  // Leere Spec = Auffangregel. Zwei Regeln decken damit jede Platzierung ab.
  expect(square.customization_spec).toEqual({});
  expect(portrait.priority).toBe(1);
  expect(square.priority).toBe(2);
});

test("no age targeting is sent, because EMPLOYMENT forbids it", () => {
  const rules = split().asset_feed_spec.asset_customization_rules;
  for (const r of rules) {
    expect("age_min" in r.customization_spec).toBe(false);
    expect("age_max" in r.customization_spec).toBe(false);
  }
});

test("each rule binds to its own asset by label, never by position", () => {
  const c = split();
  const [portrait, square] = c.asset_feed_spec.asset_customization_rules;
  const labelOf = (hash: string) =>
    c.asset_feed_spec.images.find((i: any) => i.hash === hash).adlabels[0].name;

  expect(portrait.image_label.name).toBe(labelOf("hash_p"));
  expect(square.image_label.name).toBe(labelOf("hash_s"));
  expect(portrait.image_label.name).not.toBe(square.image_label.name);
});

test("both rules get the same texts, so only the media varies", () => {
  const c = split();
  const [portrait, square] = c.asset_feed_spec.asset_customization_rules;
  expect(c.asset_feed_spec.bodies).toHaveLength(5);
  for (const body of c.asset_feed_spec.bodies) {
    expect(body.adlabels.map((l: any) => l.name).sort()).toEqual(
      [portrait.body_label.name, square.body_label.name].sort(),
    );
  }
  // Die Description gilt ungelabelt für beide.
  expect(c.asset_feed_spec.descriptions).toEqual([{ text: "d1" }]);
});

test("the ad format follows the media kind", () => {
  expect(split().asset_feed_spec.ad_formats).toEqual(["SINGLE_IMAGE"]);

  const videoPair = buildCreative({
    ...input,
    ad: {
      name: "Creative 1",
      type: "split",
      portrait: { kind: "video", videoId: "vp", fileName: "p.mp4" },
      square: { kind: "video", videoId: "vs", fileName: "s.mp4" },
    },
  }) as any;
  expect(videoPair.asset_feed_spec.ad_formats).toEqual(["SINGLE_VIDEO"]);
  expect(videoPair.asset_feed_spec.videos).toHaveLength(2);
  expect("images" in videoPair.asset_feed_spec).toBe(false);

  const mixed = buildCreative({
    ...input,
    ad: {
      name: "Creative 1",
      type: "split",
      portrait: { kind: "video", videoId: "vp", fileName: "p.mp4" },
      square: { kind: "image", hash: "hs", fileName: "s.jpg" },
    },
  }) as any;
  expect(mixed.asset_feed_spec.ad_formats).toEqual(["AUTOMATIC_FORMAT"]);
  expect(mixed.asset_feed_spec.videos).toHaveLength(1);
  expect(mixed.asset_feed_spec.images).toHaveLength(1);
});

test("a split ad is happy with a single body and headline", () => {
  // Der Zwang zu zwei Texten gilt nur für DEGREES_OF_FREEDOM, nicht für PLACEMENT.
  expect(() =>
    buildCreative({ ...input, ad: splitAd, bodies: ["b"], titles: ["t"] }),
  ).not.toThrow();
});

// --------------------------------------------------------------------- launch

function fakeGraph(fail?: (path: string, n: number, params: any) => boolean) {
  let n = 0;
  const calls: { path: string; params: any }[] = [];
  // Generisch wie `graph()` selbst getypt, sonst weist TS die Fake-Funktion
  // wegen `<T>` nicht als `LaunchDeps["graph"]` zu (Laufzeitverhalten bleibt gleich).
  const g = async <T = any>(path: string, opts: any = {}): Promise<T> => {
    n++;
    calls.push({ path, params: opts.params });
    if (fail?.(path, n, opts.params)) throw new Error("boom");
    return { id: `${path.split("/").pop()}-${n}` } as T;
  };
  return { g, calls };
}

const adOf = (name: string, videoId: string): AdInput => ({
  name,
  type: "ugc",
  asset: { kind: "video", videoId, fileName: name },
});

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
      bodies: ["b1", "b2"],
      titles: ["t"],
      description: "d",
      ads: [adOf("a.mp4", "v1"), adOf("b.mp4", "v2")],
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

test("one ad per planned ad, named after it", async () => {
  const { g, calls } = fakeGraph();
  const r = await launch(oneAdSet, { graph: g });
  expect(r.adSets[0].adIds).toHaveLength(2);
  expect(r.failed).toHaveLength(0);
  expect(calls.find((c) => c.path.endsWith("/ads"))!.params.name).toBe("a.mp4");
  // Nicht nur die Anzahl: die Receipt muss die Id der Anzeige tragen, nicht die
  // ihres Creatives – zwei Antworten je Anzeige lassen sich leicht vertauschen,
  // und eine vertauschte Id sieht in jedem längenbasierten Test gesund aus.
  for (const id of r.adSets[0].adIds) expect(id.startsWith("ads-")).toBe(true);
});

test("the campaign name never appears on an ad or its creative", async () => {
  // Vorher hieß jede Anzeige "<Kampagne> – <Datei>", also in der Anzeigenliste
  // 60 Zeichen Kampagnenname vor der einzigen Angabe, die dort unterscheidet.
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  const named = calls.filter((c) => c.path.endsWith("/ads") || c.path.endsWith("/adcreatives"));
  expect(named).not.toHaveLength(0);
  for (const c of named) expect(String(c.params.name)).not.toContain(oneAdSet.campaignName);
});

test("a failing ad is recorded by ad name without losing the ids already created", async () => {
  // Nach Namen und nicht nach Aufrufnummer: welcher Aufruf der sechste ist,
  // hängt am Weg, das Scheitern der zweiten Anzeige nicht.
  const { g } = fakeGraph((path, _n, p) => path.endsWith("/ads") && p?.name === "b.mp4");
  const r = await launch(oneAdSet, { graph: g });
  expect(r.campaignId).toBeTruthy();
  expect(r.adSets[0].adIds).toHaveLength(1);
  expect(r.failed).toEqual([{ adSetIndex: 0, adSetName: "Ads", adName: "b.mp4", error: "boom" }]);
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
      bodies: ["b2", "b3"],
      titles: ["t2"],
      description: "d2",
      ads: [adOf("c.mp4", "v3")],
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

test("an ad set that fails to create records every one of its ads as failed", async () => {
  // Sonst hat der Retry nichts, woraus er das komplette Ad Set nachbauen könnte.
  const { g } = fakeGraph((path, n) => path.endsWith("/adsets") && n === 2);
  const r = await launch(twoAdSets, { graph: g });
  expect(r.failed).toEqual([
    { adSetIndex: 0, adSetName: "Ads", adName: "a.mp4", error: "boom" },
    { adSetIndex: 0, adSetName: "Ads", adName: "b.mp4", error: "boom" },
  ]);
  expect(r.adSets[1].adIds).toHaveLength(1);
});

test("ads run as one phase across all ad sets, not interleaved per ad set", async () => {
  // Absichtlich anders als früher: alle Anzeigengruppen entstehen zuerst, danach
  // laufen alle Anzeigen als eine gemeinsame Phase – nicht mehr Gruppe für Gruppe
  // verschachtelt. Nur so können Anzeigen aus verschiedenen Anzeigengruppen
  // denselben Batch-Chunk teilen (Spec §3.1). Dieser Test hält die Reihenfolge
  // fest, damit eine spätere Änderung sie nicht unbemerkt wieder kippt.
  //
  // Seit die Anzeigen nebenläufig laufen, ist die genaue Verzahnung von adcreatives- und
  // ads-Aufrufen Sache von POOL gleichzeitigen Anzeigen und nicht mehr eins zu
  // eins je Anzeige vorhersagbar – das war ohnehin nie das Versprechen. Selbst
  // die Fertigstellungsreihenfolge der Anzeigen ist damit nicht mehr garantiert
  // Eingabereihenfolge (FIFO gilt nur für den *Start* eines Jobs, nicht für
  // seine Fertigstellung – eine langsamere Anzeige kann eine spätere
  // überholen). Was bleibt und was dieser Test hält: beide Anzeigengruppen
  // stehen vollständig, bevor die erste Anzeige beginnt, und am Ende sind
  // genau die vier erwarteten Anzeigen entstanden – über welche Reihenfolge,
  // ist nicht Teil des Versprechens.
  const twoAdSetsTwoAdsEach = {
    ...twoAdSets,
    adSets: [
      twoAdSets.adSets[0],
      { ...twoAdSets.adSets[1], ads: [adOf("c.mp4", "v3"), adOf("d.mp4", "v4")] },
    ],
  };
  const { g, calls } = fakeGraph();
  await launch(twoAdSetsTwoAdsEach, { graph: g });

  const paths = calls.map((c) => c.path.split("/").pop());
  expect(paths.slice(0, 3)).toEqual(["campaigns", "adsets", "adsets"]);
  expect(paths.slice(3).every((p) => p === "adcreatives" || p === "ads")).toBe(true);
  expect(paths.filter((p) => p === "adcreatives")).toHaveLength(4);
  expect(paths.filter((p) => p === "ads")).toHaveLength(4);
  // Welche vier Anzeigen entstanden sind, nicht in welcher Reihenfolge — die
  // Reihenfolge ist mit dem Pool Fertigstellungsreihenfolge, keine Zusage.
  const adNames = calls.filter((c) => c.path.endsWith("/ads")).map((c) => c.params.name);
  expect(new Set(adNames)).toEqual(new Set(["a.mp4", "b.mp4", "c.mp4", "d.mp4"]));
});

test("an ad-set-level failure lands in receipt.failed before a later ad-level failure from an earlier ad set", async () => {
  // Zweite Gruppe scheitert beim Anlegen (Fehler kommt sofort, in der
  // Anzeigengruppen-Schleife) und eine Anzeige der ersten Gruppe scheitert erst
  // später, in der gemeinsamen Anzeigen-Phase. Weil die Anzeigen-Phase komplett
  // nach der Anzeigengruppen-Schleife läuft, steht der Fehler der zweiten Gruppe
  // zuerst in der Receipt, obwohl die erste Gruppe im Input vorn steht — genau
  // die Umkehrung, die Spec §3.1 verlangt. Eine spätere Änderung darf das nicht
  // unbemerkt wieder umdrehen.
  //
  // Nach Namen und nicht nach Aufrufnummer: im Anzeigen-Pool ist die Reihenfolge
  // der Aufrufe nicht mehr eins zu eins vorhersagbar.
  const { g } = fakeGraph(
    (path, _n, p) =>
      (path.endsWith("/adsets") && p?.name === "Ads – Dresden") ||
      (path.endsWith("/ads") && p?.name === "b.mp4"),
  );
  const r = await launch(twoAdSets, { graph: g });
  expect(r.failed).toEqual([
    { adSetIndex: 1, adSetName: "Ads – Dresden", adName: "c.mp4", error: "boom" },
    { adSetIndex: 0, adSetName: "Ads", adName: "b.mp4", error: "boom" },
  ]);
});

test("Anzeigen laufen zu dritt, nicht nacheinander", async () => {
  let open = 0;
  let peak = 0;
  const g = async <T = any>(path: string, opts: any = {}): Promise<T> => {
    if (path.endsWith("/adcreatives")) {
      open++;
      peak = Math.max(peak, open);
      await new Promise((r) => setTimeout(r, 5));
      open--;
    }
    return { id: `${path.split("/").pop()}-x` } as T;
  };
  const eight = {
    ...oneAdSet,
    adSets: [
      {
        ...oneAdSet.adSets[0],
        ads: Array.from({ length: 8 }, (_, i) => adOf(`a${i}.mp4`, `v${i}`)),
      },
    ],
  };
  const r = await launch(eight, { graph: g });
  expect(peak).toBe(3);
  expect(r.adSets[0].adIds).toHaveLength(8);
  expect(r.failed).toHaveLength(0);
});

test("a retry with an existing ad set id skips creating a new ad set", async () => {
  const { g, calls } = fakeGraph();
  const r = await launch(
    {
      ...oneAdSet,
      existingCampaignId: "c9",
      adSets: [{ ...oneAdSet.adSets[0], existingAdSetId: "as9" }],
    },
    { graph: g },
  );
  expect(calls.some((c) => c.path.endsWith("/adsets"))).toBe(false);
  expect(r.adSets[0].id).toBe("as9");
  expect(r.adSets[0].adIds).toHaveLength(2);
});

test("die Gebotsstrategie steht auf der Kampagne, wo CBO sie ausliest", async () => {
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  const campaign = calls.find((c) => c.path.endsWith("/campaigns"))!.params;
  // Fehlt das Feld, wählt Meta selbst – zuletzt LOWEST_COST_WITH_BID_CAP.
  expect(campaign.bid_strategy).toBe("LOWEST_COST_WITHOUT_CAP");
  expect(campaign.bid_amount).toBeUndefined();
});

test("progress is reported before each call, and reaches its own total", async () => {
  // Vorher stand für die ganze Zeit nur "Creating…" da – bei einer Kampagne mit
  // drei Gruppen à fünf Anzeigen über eine Minute lang.
  const { g } = fakeGraph();
  const seen: LaunchProgress[] = [];
  await launch(oneAdSet, { graph: g, onProgress: (p) => seen.push(p) });

  // 1 Kampagne + 1 Ad Set + 2 Anzeigen.
  expect(launchSteps(oneAdSet)).toBe(4);
  expect(seen.map((p) => p.total)).toEqual([4, 4, 4, 4]);
  // Gemeldet wird vor dem Aufruf, also beginnt der Zähler bei 0. Seit dem Pool
  // starten beide Anzeigen gleichzeitig (zwei Jobs, POOL erlaubt mindestens
  // zwei) – keine ist fertig, wenn die andere beginnt, also melden beide
  // denselben Stand, bevor die erste durch ist.
  expect(seen.map((p) => p.done)).toEqual([0, 1, 2, 2]);
  expect(seen[0].label).toContain(oneAdSet.campaignName);
  expect(seen[1].label).toContain("Ads");
  expect(seen[2].label).toContain("a.mp4");
  expect(seen[3].label).toContain("b.mp4");
});

test("a failed ad still counts as done, so the bar never sticks", async () => {
  // stepDone() steht in createAd() in einem finally, damit auch eine
  // gescheiterte Anzeige den Zähler weiterschiebt – sonst bliebe der
  // gemeldete Stand hängen, sobald ein wartender Pool-Worker auf genau diesen
  // Job gewartet hätte. Das robust zu prüfen heißt: nicht an einem
  // POOL-spezifischen "genau dieser Job muss warten"-Aufbau hängen (der bricht
  // bei jeder anderen POOL-Breite und lebt vom exakten Timing des Fakes),
  // sondern denselben Lauf einmal mit und einmal ohne Fehlschlag zu machen und
  // zu verlangen, dass der höchste gemeldete Stand in beiden Fällen gleich
  // hoch ist. Viele Anzeigen (deutlich mehr als jede plausible Poolbreite)
  // stellen sicher, dass mindestens ein Worker auf eine Fertigstellung warten
  // muss, ob POOL nun 2, 3 oder 5 ist. Unter BATCH_THRESHOLD gehalten (8, nicht
  // 12), damit dieser Test weiter den Pool prüft und nicht unbeabsichtigt auf
  // den Batch-Pfad rutscht.
  const many = {
    ...oneAdSet,
    adSets: [
      {
        ...oneAdSet.adSets[0],
        ads: Array.from({ length: 8 }, (_, i) => adOf(`ad${i}.mp4`, `v${i}`)),
      },
    ],
  };

  const maxDoneSeen = async (fail?: (path: string, n: number, params: any) => boolean) => {
    const { g } = fakeGraph(fail);
    const seen: LaunchProgress[] = [];
    await launch(many, { graph: g, onProgress: (p) => seen.push(p) });
    return Math.max(...seen.map((p) => p.done));
  };

  const allSucceed = await maxDoneSeen();
  const oneFails = await maxDoneSeen((path, _n, p) => path.endsWith("/ads") && p?.name === "ad5.mp4");
  expect(oneFails).toBe(allSucceed);
});

test("a whole ad set that fails does not leave its ads hanging in the count", async () => {
  // Scheitert das Ad Set, wird keine seiner Anzeigen versucht – sie dürfen den
  // Zähler trotzdem nicht dauerhaft unter dem Nenner festhalten.
  const two = {
    ...oneAdSet,
    adSets: [{ ...oneAdSet.adSets[0], name: "Broken" }, { ...oneAdSet.adSets[0], name: "Fine" }],
  };
  // 1 campaign, 2 adset(Broken) -> fail
  const { g } = fakeGraph((path, n) => path.endsWith("/adsets") && n === 2);
  const seen: LaunchProgress[] = [];
  await launch(two, { graph: g, onProgress: (p) => seen.push(p) });
  // Die erste Anzeige der zweiten Gruppe zählt schon die drei übersprungenen mit.
  const fine = seen.find((p) => p.label.includes("Anzeigengruppe „Fine“"))!;
  expect(fine.done).toBe(3);
});

test("retrying an existing campaign only counts what is left to build", async () => {
  expect(
    launchSteps({
      ...oneAdSet,
      existingCampaignId: "c1",
      adSets: [{ ...oneAdSet.adSets[0], existingAdSetId: "s1" }],
    }),
  ).toBe(2);
});

// ----------------------------------------------------------------- Batch path

function fakeBatch() {
  const sent: any[][] = [];
  const b = async <T = any>(reqs: any[]): Promise<PromiseSettledResult<T>[]> => {
    sent.push(reqs);
    return reqs.map((r, i) => ({
      status: "fulfilled" as const,
      value: { id: `${r.relative_url.split("/").pop()}-${sent.length}-${i}` } as T,
    }));
  };
  return { b, sent };
}

const manyAds = (n: number) => ({
  ...oneAdSet,
  adSets: [
    {
      ...oneAdSet.adSets[0],
      ads: Array.from({ length: n }, (_, i) => adOf(`a${i}.mp4`, `v${i}`)),
    },
  ],
});

test("ab neun Anzeigen wird gebündelt, darunter nicht", async () => {
  const eight = fakeBatch();
  await launch(manyAds(8), { graph: fakeGraph().g, batch: eight.b });
  expect(eight.sent).toHaveLength(0);

  const nine = fakeBatch();
  await launch(manyAds(9), { graph: fakeGraph().g, batch: nine.b });
  expect(nine.sent).not.toHaveLength(0);
});

test("zwanzig Anzeigen sind vier Aufrufe zu je fünf Anzeigen", async () => {
  const { b, sent } = fakeBatch();
  const r = await launch(manyAds(20), { graph: fakeGraph().g, batch: b });
  expect(sent).toHaveLength(4);
  for (const call of sent) expect(call).toHaveLength(10);
  expect(r.adSets[0].adIds).toHaveLength(20);
  expect(r.failed).toHaveLength(0);
  // Nicht nur die Anzahl: jede Id muss aus der /ads-Antwort stammen, nicht aus
  // der /adcreatives-Antwort desselben Paares – fakeBatch kodiert relative_url
  // in die Id, genau dafür.
  for (const id of r.adSets[0].adIds) expect(id.startsWith("ads-")).toBe(true);
});

test("die Anzeige hängt am Creative desselben Paares", async () => {
  const { b, sent } = fakeBatch();
  await launch(manyAds(9), { graph: fakeGraph().g, batch: b });
  const [creative, ad] = sent[0];
  expect(creative.relative_url).toBe("act_1/adcreatives");
  expect(creative.name).toBe("cr_0");
  expect(creative.body.name).toBe("a0.mp4");
  expect(ad.relative_url).toBe("act_1/ads");
  expect(ad.depends_on).toBe("cr_0");
  expect(ad.body.creative).toEqual({ creative_id: "{result=cr_0:$.id}" });
  expect(sent[1][0].name).toBe("cr_5");
});

test("Anzeigen zweier Gruppen teilen sich einen Aufruf und behalten ihre Gruppe", async () => {
  const { b, sent } = fakeBatch();
  const two = {
    ...oneAdSet,
    adSets: [
      { ...oneAdSet.adSets[0], name: "A", ads: [adOf("a.mp4", "v1")] },
      { ...oneAdSet.adSets[0], name: "B", ads: Array.from({ length: 8 }, (_, i) => adOf(`b${i}.mp4`, `w${i}`)) },
    ],
  };
  await launch(two, { graph: fakeGraph().g, batch: b });
  const adsIn = sent[0].filter((r: any) => r.relative_url.endsWith("/ads"));
  expect(new Set(adsIn.map((r: any) => r.body.adset_id)).size).toBe(2);
});

test("ein gescheitertes Creative ist ein Fehler und nicht zwei", async () => {
  // Meta liefert für den abhängigen Sub-Request dann null, und unwrapBatchItem
  // macht daraus "timed out" – das darf nicht als zweiter Fehler derselben
  // Anzeige in der Receipt landen.
  //
  // Neun Anzeigen sind bei CHUNK=5 zwei Aufrufe (5 + 4), das Fake bekommt seine
  // reqs also zweimal mit je eigenem lokalem Index 0. Gezählt wird deshalb über
  // beide Aufrufe hinweg, sonst träfe dieselbe Regel den ersten Job jedes
  // Aufrufs und es entstünde der zweite Fehler, den dieser Test gerade
  // ausschließen soll.
  let n = 0;
  const b = async <T = any>(reqs: any[]): Promise<PromiseSettledResult<T>[]> =>
    reqs.map(() => {
      const i = n++;
      return i === 0
        ? { status: "rejected" as const, reason: new Error("creative kaputt") }
        : i === 1
          ? { status: "rejected" as const, reason: new Error("Batch sub-request timed out") }
          : { status: "fulfilled" as const, value: { id: `x-${i}` } as T };
    });
  const r = await launch(manyAds(9), { graph: fakeGraph().g, batch: b });
  // adSetIndex gehört zur Fehlerform überall in dieser Datei (siehe fail() in
  // lib/launch.ts) – das Retry-UI gruppiert danach und ohne ihn stünde die
  // Anzeige an der falschen Stelle oder gar nicht im Retry.
  expect(r.failed).toEqual([
    { adSetIndex: 0, adSetName: "Ads", adName: "a0.mp4", error: "creative kaputt" },
  ]);
  expect(r.adSets[0].adIds).toHaveLength(8);
});

test("eine gescheiterte Anzeige nach heilem Creative steht mit ihrem Fehler da", async () => {
  // Wie oben: über beide Aufrufe hinweg gezählt, damit nur die Anzeige des
  // allerersten Sub-Request-Paares (a0) betroffen ist, nicht auch a5 im
  // zweiten Chunk.
  let n = 0;
  const b = async <T = any>(reqs: any[]): Promise<PromiseSettledResult<T>[]> =>
    reqs.map(() => {
      const i = n++;
      return i === 1
        ? { status: "rejected" as const, reason: new Error("anzeige kaputt") }
        : { status: "fulfilled" as const, value: { id: `x-${i}` } as T };
    });
  const r = await launch(manyAds(9), { graph: fakeGraph().g, batch: b });
  expect(r.failed).toEqual([
    { adSetIndex: 0, adSetName: "Ads", adName: "a0.mp4", error: "anzeige kaputt" },
  ]);
});

test("eine bestätigte Anzeige ohne lesbare Id kostet die Anzeige, nicht die Quittung", async () => {
  // unwrapBatchItem liefert für einen 2xx-Sub-Request, dessen Body kein JSON ist,
  // absichtlich einen erfüllten Eintrag ohne Wert. Ungeprüft wäre der Zugriff auf
  // die Id ein TypeError – und der entstünde in der Ergebnisauswertung außerhalb
  // des try, risse also launch() ganz ab, obwohl Kampagne und Anzeigengruppe bei
  // Meta längst stehen. Ohne Quittung hat das Retry-UI keine campaignId und
  // bietet gar keinen zweiten Versuch an; die einzige Rettung wäre eine zweite,
  // doppelte Kampagne. Der Pool isoliert denselben Fall auf eine Anzeige, der
  // Batch muss das auch.
  let n = 0;
  const b = async <T = any>(reqs: any[]): Promise<PromiseSettledResult<T>[]> =>
    reqs.map(() => {
      const i = n++;
      return i === 1
        ? unwrapBatchItem<T>({ code: 200, body: "<html>Bad Gateway</html>" })
        : { status: "fulfilled" as const, value: { id: `x-${i}` } as T };
    });
  const r = await launch(manyAds(9), { graph: fakeGraph().g, batch: b });

  expect(r.campaignId).toBeTruthy();
  expect(r.failed).toHaveLength(1);
  expect(r.failed[0]).toMatchObject({ adSetIndex: 0, adSetName: "Ads", adName: "a0.mp4" });
  expect(r.failed[0].error).toContain("ohne lesbare Id");
  // Die übrigen acht bleiben heil, und keine undefined-Id schleicht sich in die
  // Liste, aus der das Retry-UI die fehlenden Anzeigen ableitet.
  expect(r.adSets[0].adIds).toHaveLength(8);
  expect(r.adSets[0].adIds).not.toContain(undefined);
});

test("ein Batch-Fehler von Meta wird einzeln nachgeholt", async () => {
  // Meta hat mit einem Fehler-Body geantwortet – dann ist kein Sub-Request
  // gelaufen und dieselben Anzeigen dürfen noch einmal los.
  let batchCalls = 0;
  const b = async () => {
    batchCalls++;
    throw new GraphError({ kind: "rate", message: "limit", retryable: true });
  };
  const { g, calls } = fakeGraph();
  const r = await launch(manyAds(9), { graph: g, batch: b as any });
  expect(r.adSets[0].adIds).toHaveLength(9);
  expect(r.failed).toHaveLength(0);
  expect(calls.filter((c) => c.path.endsWith("/adcreatives"))).toHaveLength(9);
  // Neun Anzeigen sind bei CHUNK=5 zwei Chunks (5 + 4) – also genau zwei
  // Batch-Aufrufe, nie ein dritter. Ohne diesen Zähler bliebe ein zusätzlicher,
  // stiller Wiederholungsversuch von ctx.batch() selbst unbemerkt, weil kein
  // anderer Test die Aufrufe des Fakes zählt.
  expect(batchCalls).toBe(2);
});

test("ein abgerissener Batch wird nicht nachgeholt, sondern benannt", async () => {
  // Ohne Antwort von Meta ist offen, ob die Sub-Requests dieses Chunks – zwei
  // je Anzeige, also höchstens zehn – gelaufen sind.
  // Ein zweiter Versuch legt im Zweifel jede Anzeige doppelt an.
  let batchCalls = 0;
  const b = async () => {
    batchCalls++;
    throw new TypeError("fetch failed");
  };
  const { g, calls } = fakeGraph();
  const r = await launch(manyAds(9), { graph: g, batch: b as any });
  expect(calls.some((c) => c.path.endsWith("/adcreatives"))).toBe(false);
  expect(r.failed).toHaveLength(9);
  expect(r.failed[0].error).toContain("fetch failed");
  expect(r.failed[0].error).toContain("möglicherweise");
  expect(r.campaignId).toBeTruthy();
  // Die eigentliche Katastrophe, die der GraphError-Vorbehalt verhindern soll: ein zweiter,
  // stiller Versuch auf denselben Chunk, bevor er als abgerissen benannt wird.
  // Genau ein Aufruf je Chunk (zwei bei neun Anzeigen), nie ein dritter.
  expect(batchCalls).toBe(2);
});

test("ein Baufehler vor dem Batch-Aufruf wird nicht als abgerissen gemeldet", async () => {
  // Eine UGC-Anzeige mit nur einem Text scheitert schon beim Bauen der
  // Sub-Requests, also bevor ctx.batch() überhaupt gerufen wird. Das ist ein
  // Programmfehler und keine unklare Netzwerklage – die Anzeigen sind beweisbar
  // nie losgegangen. Die "möglicherweise trotzdem erstellt"-Meldung wäre hier
  // falsch und schickte den Bediener in den Ads Manager, eine Anzeige zu
  // suchen, die es nicht gibt.
  const base = manyAds(9);
  const broken = { ...base, adSets: [{ ...base.adSets[0], bodies: ["b"], titles: ["t"] }] };
  let error: Error | undefined;
  try {
    await launch(broken, { graph: fakeGraph().g, batch: fakeBatch().b });
  } catch (e) {
    error = e as Error;
  }
  expect(error).toBeDefined();
  expect(error!.message).toContain("mindestens zwei");
  expect(error!.message).not.toContain("möglicherweise");
});

test("ein nicht-Error-Wurf im abgerissenen Zweig verliert nicht die Ursache", async () => {
  // Ein geworfener String hat kein .message – ohne Fallback stünde hier
  // "undefined" statt der eigentlichen Ursache. Das sichere Verhalten (nicht
  // nachholen, benennen) ist davon unabhängig und bleibt gleich.
  const b = async () => {
    throw "socket hang up";
  };
  const { g } = fakeGraph();
  const r = await launch(manyAds(9), { graph: g, batch: b as any });
  expect(r.failed).toHaveLength(9);
  expect(r.failed[0].error).toContain("socket hang up");
  expect(r.failed[0].error).not.toContain("undefined");
});

test("der Fortschritt zählt weiter in Anzeigen", async () => {
  const seen: LaunchProgress[] = [];
  const { b } = fakeBatch();
  await launch(manyAds(9), {
    graph: fakeGraph().g,
    batch: b,
    onProgress: (p) => seen.push(p),
  });
  // 1 Kampagne + 1 Anzeigengruppe + 9 Anzeigen
  expect(seen[0].total).toBe(11);
  expect(seen.at(-1)!.done).toBe(7);
  expect(seen.at(-1)!.label).toContain("6–9 von 9");
});

test("beide Wege liefern dieselbe Quittung", async () => {
  // Welcher Pfad lief, darf im Ergebnis nicht sichtbar sein. Es gibt bewusst
  // keine LaunchDeps-Option, den Pfad zu erzwingen – das wäre ein zweiter Weg
  // für die Produktion, ihn zu wählen. Also acht Anzeigen (Pool) gegen neun
  // (Batch), verglichen wird die Form der Quittung, nicht ihre Zahlen.
  const shape = (r: Awaited<ReturnType<typeof launch>>) => ({
    campaign: Boolean(r.campaignId),
    sets: r.adSets.map((s) => ({ name: s.name, ads: s.adIds.length, error: s.error })),
    failed: r.failed,
  });

  const poolBatch = fakeBatch();
  const pool = shape(await launch(manyAds(8), { graph: fakeGraph().g, batch: poolBatch.b }));
  const batchedBatch = fakeBatch();
  const batched = shape(await launch(manyAds(9), { graph: fakeGraph().g, batch: batchedBatch.b }));

  // Die reine Quittungsform ist bei beiden Fakes auch dann identisch, wenn
  // heimlich immer derselbe Pfad läuft (fakeGraph/fakeBatch liefern beide
  // gleichförmig eine Id je Anzeige). Ohne diesen Beweis, welcher Pfad
  // tatsächlich lief, hieße der Test "dieselbe Quittung", würde aber nicht
  // scheitern, wenn ihm einer der beiden Wege abhandenkäme.
  expect(poolBatch.sent).toHaveLength(0);
  expect(batchedBatch.sent).toHaveLength(2); // CHUNK=5 bei 9 Anzeigen: 5 + 4

  expect(pool.campaign).toBe(true);
  expect(batched.campaign).toBe(true);
  expect(pool.failed).toEqual([]);
  expect(batched.failed).toEqual([]);
  expect(pool.sets[0]).toEqual({ name: "Ads", ads: 8, error: undefined });
  expect(batched.sets[0]).toEqual({ name: "Ads", ads: 9, error: undefined });
});

test("eine gewöhnliche Anzeigenpanne liefert auf beiden Wegen dieselbe Fehlerform", async () => {
  // Über die reine Erfolgs-Quittung hinaus (Test oben): auch ein normaler
  // Anzeigen-Fehlschlag (keine zerrissene Batch, kein Baufehler) muss auf
  // beiden Pfaden dieselbe Fehlerform ergeben – adSetIndex eingeschlossen,
  // an dem receipt.tsx den Retry-Button gruppiert. Getroffen wird jeweils die
  // erste Anzeige ("a0.mp4"), damit derselbe Job auf beiden Pfaden scheitert.
  const shape = (r: Awaited<ReturnType<typeof launch>>) => ({
    ads: r.adSets[0].adIds.length,
    failed: r.failed.map((f) => ({ adSetIndex: f.adSetIndex, adSetName: f.adSetName, adName: f.adName })),
  });

  const poolFail = fakeGraph((path, _n, p) => path.endsWith("/ads") && p?.name === "a0.mp4");
  const pool = shape(await launch(manyAds(8), { graph: poolFail.g, batch: fakeBatch().b }));

  let n = 0;
  const batchFail = async <T = any>(reqs: any[]): Promise<PromiseSettledResult<T>[]> =>
    reqs.map(() => {
      const i = n++;
      return i === 1
        ? { status: "rejected" as const, reason: new Error("anzeige kaputt") }
        : { status: "fulfilled" as const, value: { id: `x-${i}` } as T };
    });
  const batched = shape(await launch(manyAds(9), { graph: fakeGraph().g, batch: batchFail }));

  expect(pool.ads).toBe(7);
  expect(batched.ads).toBe(8);
  expect(pool.failed).toEqual([{ adSetIndex: 0, adSetName: "Ads", adName: "a0.mp4" }]);
  expect(batched.failed).toEqual([{ adSetIndex: 0, adSetName: "Ads", adName: "a0.mp4" }]);
});
