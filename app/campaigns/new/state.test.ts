import { expect, test } from "bun:test";
import {
  customerBlockers,
  detailBlockers,
  dissolveAd,
  emptyAdSet,
  initialState,
  promoteLoose,
  swapPair,
  withArrivedAssets,
  type WizardAd,
  type WizardAdSet,
  type WizardImageAsset,
  type WizardLooseAsset,
  type WizardState,
  type WizardVideoAsset,
} from "./state";

// Ein Zustand, an dem nichts offen ist – jeder Test dreht genau eine Schraube,
// damit die erwartete Liste nur von dieser einen Änderung kommt.
const ready = (patch: Partial<WizardState> = {}): WizardState => ({
  ...initialState("act_1", "Herzhalt Pflegedienst"),
  campaignName: "Herzhalt Pflegedienst | PFK | 13.08. | JP",
  ...patch,
});

test("ein fertiger Zustand blockiert weder Schritt 1 noch Schritt 3", () => {
  expect(customerBlockers(ready())).toEqual([]);
  expect(detailBlockers(ready())).toEqual([]);
});

test("das fehlende Werbekonto hält Schritt 1 auf, nicht Schritt 3", () => {
  const state = ready({ adAccount: "" });
  expect(customerBlockers(state)).toHaveLength(1);
  expect(detailBlockers(state)).toEqual([]);
});

test("Name und Zahlen halten Schritt 3 auf, nicht Schritt 1", () => {
  const state = ready({ campaignName: "  ", dailyBudgetEuros: 0, spendCapEuros: 50 });
  expect(detailBlockers(state)).toHaveLength(3);
  expect(customerBlockers(state)).toEqual([]);
});

test("ein Ausgabenlimit ab 100 € ist keins mehr", () => {
  expect(detailBlockers(ready({ spendCapEuros: 100 }))).toEqual([]);
  // Kein Limit ist erlaubt – nur ein zu kleines nicht.
  expect(detailBlockers(ready({ spendCapEuros: undefined }))).toEqual([]);
});

const video = (fileName: string): WizardVideoAsset & { id: string } => ({
  id: crypto.randomUUID(),
  kind: "video",
  videoId: fileName,
  fileName,
  orientation: "portrait",
});

/**
 * Der Weg, den eine fertige Datei aus upload-queue.ts in den Entwurf nimmt.
 * Seit die Uploads außerhalb der Komponente laufen, kommen sie einzeln und
 * jederzeit an – auch aus einem Schwung, dessen Anzeigengruppe gerade gar nicht
 * zu sehen ist.
 */
test("angekommene Videos werden zu UGC-Anzeigen, ohne die vorhandenen anzurühren", () => {
  const first = withArrivedAssets(emptyAdSet(0), [video("lea-1.mp4")]);
  expect(first.ads).toHaveLength(1);
  expect(first.ads[0].type).toBe("ugc");
  // Der Dateiname wird zur Schreibweise der Anzeigenliste normalisiert.
  expect(first.ads[0].name).toBe("Lea-1");
  expect(first.loose).toEqual([]);

  // Die zweite Datei baut auf dem Stand nach der ersten auf, statt ihn zu
  // ersetzen – genau der Fall, den zwei gleichzeitige Uploads erzeugen.
  const second = withArrivedAssets(
    { ...emptyAdSet(0), ...first },
    [video("lea-2.mp4")],
  );
  expect(second.ads.map((a) => a.name)).toEqual(["Lea-1", "Lea-2"]);
});

const image = (
  fileName: string,
  orientation: "portrait" | "square",
): WizardImageAsset & { id: string } => ({
  id: crypto.randomUUID(),
  kind: "image",
  hash: fileName,
  fileName,
  orientation,
});

const content = (
  ads: WizardAd[],
  loose: WizardLooseAsset[] = [],
): Pick<WizardAdSet, "ads" | "loose"> => ({ ads, loose });

test("ein einzelnes Bild bleibt liegen, statt sich eine Hälfte zu erfinden", () => {
  const { ads, loose } = withArrivedAssets(emptyAdSet(0), [image("motiv-hoch.jpg", "portrait")]);
  expect(ads).toEqual([]);
  expect(loose.map((a) => a.fileName)).toEqual(["motiv-hoch.jpg"]);
});

/**
 * Jeder Weg in eine Anzeige führt auch wieder heraus. Vorher endete das Paaren
 * eines Videos in einer Sackgasse: „Paar trennen“ legte das Video zu den
 * liegengebliebenen Dateien, und von dort führte kein Menüpunkt zurück.
 */
test("ein Foto-Paar zerfällt wieder in seine beiden Hälften", () => {
  const ad: WizardAd = {
    id: "a1",
    name: "Creative 1",
    type: "split",
    portrait: image("motiv-hoch.jpg", "portrait"),
    square: image("motiv-quer.jpg", "square"),
  };
  const after = dissolveAd(content([ad]), "a1");
  expect(after.ads).toEqual([]);
  expect(after.loose.map((a) => a.fileName)).toEqual(["motiv-hoch.jpg", "motiv-quer.jpg"]);
  // Frische IDs: die Hälften einer Anzeige tragen keine, die zweimal auftauchen darf.
  expect(new Set(after.loose.map((a) => a.id)).size).toBe(2);
});

test("auch eine Anzeige mit einem einzelnen Motiv geht zurück in die Ablage", () => {
  const single: WizardAd = {
    id: "a1",
    name: "Creative 1",
    type: "single",
    asset: image("motiv-hoch.jpg", "portrait"),
  };
  const ugc: WizardAd = { id: "a2", name: "Lea 1", type: "ugc", asset: video("lea 1.mp4") };
  const after = dissolveAd(dissolveAd(content([single, ugc]), "a1"), "a2");
  expect(after.ads).toEqual([]);
  expect(after.loose.map((a) => a.fileName)).toEqual(["motiv-hoch.jpg", "lea 1.mp4"]);
});

test("ein liegengebliebenes Video wird wieder zur UGC-Anzeige, ein Bild zum Einzelbild", () => {
  const set = content([], [video("lea 1.mp4"), image("motiv-hoch.jpg", "portrait")]);
  const withVideo = promoteLoose(set, set.loose[0].id);
  expect(withVideo.ads).toHaveLength(1);
  expect(withVideo.ads[0].type).toBe("ugc");
  // Derselbe Name wie beim Hochladen – die Anzeige heißt nicht plötzlich anders.
  expect(withVideo.ads[0].name).toBe("Lea 1");

  const withBoth = promoteLoose(withVideo, set.loose[1].id);
  expect(withBoth.ads.map((a) => a.type)).toEqual(["ugc", "single"]);
  expect(withBoth.loose).toEqual([]);
});

test("die Formate eines Paares lassen sich tauschen, ohne dass es zerfällt", () => {
  const ad: WizardAd = {
    id: "a1",
    name: "Creative 1",
    type: "split",
    portrait: image("motiv-hoch.jpg", "portrait"),
    square: image("motiv-quer.jpg", "square"),
  };
  const [swapped] = swapPair([ad], "a1");
  if (swapped.type !== "split") throw new Error("aus einem Paar wird kein anderer Typ");
  expect(swapped.portrait.fileName).toBe("motiv-quer.jpg");
  expect(swapped.square.fileName).toBe("motiv-hoch.jpg");
  expect(swapped.name).toBe("Creative 1");
  // Zweimal getauscht ist der Ausgangsstand – der Griff ist ein Umschalter.
  expect(swapPair(swapPair([ad], "a1"), "a1")).toEqual([ad]);
});

test("das Tauschen an einer geliehenen Anzeige löst die Verbindung", () => {
  const borrowed: WizardAd = {
    id: "a1",
    name: "Creative 1",
    source: { adSetId: "s1", adId: "x1" },
    type: "split",
    portrait: image("motiv-hoch.jpg", "portrait"),
    square: image("motiv-quer.jpg", "square"),
  };
  expect(swapPair([borrowed], "a1")[0].source).toBeUndefined();
});
