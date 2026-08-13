import { expect, test } from "bun:test";
import type { Receipt } from "@/lib/launch";
import { buildRetryAdSets } from "./receipt";
import type { WizardSubmission } from "../actions";

// Minimale Anzeige – Inhalt ist für buildRetryAdSets irrelevant, nur der Name
// zählt für die Zuordnung innerhalb eines Ad Sets.
const ad = (name: string) =>
  ({ name, type: "ugc", asset: { kind: "video", videoId: "v", fileName: "f" } }) as const;

const adSet = (name: string, adNames: string[]) => ({
  name,
  addressString: "",
  radiusKm: 5,
  formId: "form",
  bodies: ["a", "b"],
  titles: ["a", "b"],
  description: "",
  ads: adNames.map(ad),
});

const submission: WizardSubmission = {
  clientId: "c1",
  adAccount: "act_1",
  campaignName: "Kampagne",
  dailyBudgetCents: 1000,
  adSets: [
    adSet("Ads – Leipzig", ["a.mp4", "b.mp4"]),
    adSet("Ads – Dresden", ["c.mp4", "d.mp4"]),
  ],
};

test("Retry ordnet Fehler über adSetIndex zu, nicht über Position im Fehler-Array", () => {
  // receipt.failed kommt hier absichtlich NICHT in Eingabereihenfolge an –
  // genau das bricht der Pool (Task 6) und, unabhängig davon, schon eine
  // Ad-Set-Anlage-Fehler-vor-Ad-Fehler-Konstellation (siehe Commit 86923bd).
  const receipt: Receipt = {
    campaignId: "camp_1",
    adSets: [
      { index: 0, id: "as_0", name: "Ads – Leipzig", adIds: ["ad_a"] },
      { index: 1, id: "as_1", name: "Ads – Dresden", adIds: ["ad_c"] },
    ],
    failed: [
      // Zuerst der Fehler aus dem zweiten Ad Set, dann erst der aus dem ersten –
      // eine positionsbasierte Zuordnung würde das zweite Ad Set duplizieren
      // und das erste leer lassen.
      { adSetIndex: 1, adSetName: "Ads – Dresden", adName: "d.mp4", error: "boom" },
      { adSetIndex: 0, adSetName: "Ads – Leipzig", adName: "b.mp4", error: "boom" },
    ],
  };

  const retrySets = buildRetryAdSets(receipt, submission);

  expect(retrySets).toHaveLength(2);

  const leipzig = retrySets.find((s) => s.name === "Ads – Leipzig");
  expect(leipzig?.ads.map((a) => a.name)).toEqual(["b.mp4"]);
  expect(leipzig?.existingAdSetId).toBe("as_0");

  const dresden = retrySets.find((s) => s.name === "Ads – Dresden");
  expect(dresden?.ads.map((a) => a.name)).toEqual(["d.mp4"]);
  expect(dresden?.existingAdSetId).toBe("as_1");
});

test("gleicher Anzeigenname in zwei Ad Sets landet nur im richtigen Ad Set", () => {
  const collidingSubmission: WizardSubmission = {
    ...submission,
    adSets: [adSet("Ads – Leipzig", ["a.mp4"]), adSet("Ads – Dresden", ["a.mp4"])],
  };

  const receipt: Receipt = {
    campaignId: "camp_1",
    adSets: [
      { index: 0, id: "as_0", name: "Ads – Leipzig", adIds: [] },
      { index: 1, id: "as_1", name: "Ads – Dresden", adIds: [] },
    ],
    // Nur Dresden ist fehlgeschlagen – Leipzig darf trotz gleichem Anzeigennamen
    // nicht mit erneut versucht werden.
    failed: [{ adSetIndex: 1, adSetName: "Ads – Dresden", adName: "a.mp4", error: "boom" }],
  };

  const retrySets = buildRetryAdSets(receipt, collidingSubmission);

  expect(retrySets).toHaveLength(1);
  expect(retrySets[0].name).toBe("Ads – Dresden");
  expect(retrySets[0].ads.map((a) => a.name)).toEqual(["a.mp4"]);
});

test("ein beim Anlegen gescheitertes Ad Set kommt komplett in den Retry", () => {
  // launch() legt den Eintrag in receipt.adSets an, *bevor* es die
  // Anzeigengruppe bei Meta anlegt (lib/launch.ts) – ein Anlage-Fehler
  // hinterlässt also einen Eintrag ohne id, aber mit error, und jede seiner
  // Anzeigen einzeln in receipt.failed. Genau der Reparaturfall, für den die
  // Receipt existiert.
  const receipt: Receipt = {
    campaignId: "camp_1",
    adSets: [
      { index: 0, id: "as_0", name: "Ads – Leipzig", adIds: ["ad_a", "ad_b"] },
      { index: 1, id: undefined, name: "Ads – Dresden", adIds: [], error: "adset failed" },
    ],
    failed: [
      { adSetIndex: 1, adSetName: "Ads – Dresden", adName: "c.mp4", error: "adset failed" },
      { adSetIndex: 1, adSetName: "Ads – Dresden", adName: "d.mp4", error: "adset failed" },
    ],
  };

  const retrySets = buildRetryAdSets(receipt, submission);

  // Leipzig steht vollständig und hat keinen Fehler – nur Dresden geht erneut los.
  expect(retrySets).toHaveLength(1);
  expect(retrySets[0].name).toBe("Ads – Dresden");
  expect(retrySets[0].ads.map((a) => a.name)).toEqual(["c.mp4", "d.mp4"]);
  // Ohne existingAdSetId legt launch() die Anzeigengruppe neu an und hängt die
  // Anzeigen darunter. Stünde hier eine Id, liefe der Retry gegen eine
  // Anzeigengruppe, die es bei Meta nie gab.
  expect(retrySets[0].existingAdSetId).toBeUndefined();
});
