import { expect, test } from "bun:test";
import type { AssembledBrief } from "@/lib/brief";
import {
  applyBrief,
  duplicateAdSet,
  firstScreen,
  hasWork,
  reapplyBrief,
  syncLinkedAds,
  cityOf,
  textInstructions,
  applyCrop,
  customerBlockers,
  DEFAULT_DAILY_BUDGET,
  detailBlockers,
  queuedLaunch,
  dissolveAd,
  draftLabel,
  edited,
  emptyAdSet,
  hydrate,
  initialState,
  promoteLoose,
  reviewStatus,
  shouldSave,
  swapPair,
  upsertDraft,
  withArrivedAssets,
  type Draft,
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

test("die Prüfzeile zählt fertige Bereiche und alle offenen Punkte", () => {
  expect(reviewStatus([0, 2, 1])).toEqual({ ready: 1, total: 3, open: 3 });
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
  expect(withBoth.ads[1].name).toBe("Bild 1");
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

/**
 * Was die Entwurfsliste sauber hält, ohne über den Inhalt zu urteilen: zwei
 * Änderungen legen einen Entwurf an, egal welche. Ein bloß geöffneter oder
 * einmal angetippter Assistent hinterlässt nichts.
 */
test("zwei Änderungen legen einen Entwurf an, eine noch nicht", () => {
  expect(shouldSave(0, false)).toBe(false);
  expect(shouldSave(1, false)).toBe(false);
  expect(shouldSave(2, false)).toBe(true);
  expect(shouldSave(17, false)).toBe(true);
});

test("an einem Entwurf, den es schon gibt, zählt jede einzelne Änderung", () => {
  // Sonst ginge die erste Änderung nach dem Fortsetzen verloren – genau die,
  // wegen der jemand den Entwurf wieder aufgemacht hat.
  expect(shouldSave(0, true)).toBe(true);
  expect(shouldSave(1, true)).toBe(true);
});

const draft = (id: string, savedAt: number, state = ready()): Draft => ({ id, savedAt, state });

test("der zuletzt berührte Entwurf steht vorn, und über zehn hebt niemand auf", () => {
  const older = [draft("b", 2), draft("c", 1)];
  expect(upsertDraft(older, draft("a", 3)).map((d) => d.id)).toEqual(["a", "b", "c"]);

  // Derselbe Entwurf ein zweites Mal gespeichert bleibt einer – sonst stünde
  // nach einer Minute Tippen dieselbe Kampagne sechzigmal in der Liste.
  const again = upsertDraft([draft("b", 2), draft("a", 1)], draft("a", 3));
  expect(again.map((d) => d.id)).toEqual(["a", "b"]);
  expect(again[0].savedAt).toBe(3);

  const many = Array.from({ length: 12 }, (_, i) => draft(`d${i}`, i));
  const capped = upsertDraft(many, draft("neu", 99));
  expect(capped).toHaveLength(10);
  expect(capped.at(-1)?.id).toBe("d8");
});

test("ein Entwurf heißt wie seine Kampagne, sonst wie sein Kunde", () => {
  expect(draftLabel(draft("a", 1))).toBe("Herzhalt Pflegedienst | PFK | 13.08. | JP");
  expect(draftLabel(draft("a", 1, ready({ campaignName: "  " })))).toBe("Herzhalt Pflegedienst");
  expect(draftLabel(draft("a", 1, ready({ campaignName: "", business: "" })))).toBe("Ohne Kunde");
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



/**
 * Der Fall aus dem Sammelordner: „page-1“ bis „page-12“ aus einem PDF-Export,
 * fertig in zufälliger Reihenfolge. Vorher nahm sich „page-4“ die „page-5“,
 * sobald beide da waren – und „page-3“ blieb liegen. Vorgeschlagene Paare
 * werden deshalb mit jedem Schwung neu geplant.
 */
test("Paare werden neu geplant, wenn spätere Dateien eine bessere Reihe ergeben", () => {
  const page = (n: number) => image(`page-${n}.png`, n % 2 ? "portrait" : "square");
  let set = { ...emptyAdSet(0) };
  for (const batch of [[4, 5], [3], [6, 1], [2]])
    set = { ...set, ...withArrivedAssets(set, batch.map(page)) };
  const pairs = set.ads.map((a) => (a.type === "split" ? `${a.portrait.fileName}+${a.square.fileName}` : a.name));
  expect(pairs.sort()).toEqual(["page-1.png+page-2.png", "page-3.png+page-4.png", "page-5.png+page-6.png"]);
  expect(set.loose).toEqual([]);
  expect(new Set(set.ads.map((a) => a.name)).size).toBe(3);
});

test("ein Paar von Hand oder aus dem Zuschnitt bleibt bei neuen Dateien stehen", () => {
  const manual: WizardAd = {
    id: "m",
    name: "Creative 1",
    type: "split",
    portrait: image("page-3.png", "portrait"),
    square: image("page-4.png", "square"),
    reason: "Aus einem Bild zugeschnitten: page-3.png",
  };
  const set = { ...emptyAdSet(0), ads: [manual] };
  const out = withArrivedAssets(set, [image("page-5.png", "portrait"), image("page-2.png", "square")]);
  expect(out.ads[0]).toBe(manual);
  expect(out.ads).toHaveLength(1);
  expect(out.loose.map((a) => a.fileName).sort()).toEqual(["page-2.png", "page-5.png"]);
});

test("dieselbe Datei kommt kein zweites Mal an", () => {
  const set = { ...emptyAdSet(0), ...withArrivedAssets(emptyAdSet(0), [video("lea-1.mp4")]) };
  const again = withArrivedAssets(set, [video("lea-1.mp4"), image("solo.jpg", "square")]);
  expect(again.ads).toHaveLength(1);
  expect(again.loose).toHaveLength(1);
  const third = withArrivedAssets({ ...set, ...again }, [image("solo.jpg", "square")]);
  expect(third.loose).toHaveLength(1);
});

test("ein Einzelbild ins andere Format geschnitten wird zum Paar aus Original und Ausschnitt", () => {
  const single: WizardAd = { id: "a", name: "Creative 1", type: "single", asset: image("Lea.jpg", "square") };
  const out = applyCrop({ ads: [single], loose: [] }, { adId: "a" }, image("Lea 9x16.jpg", "portrait"));
  expect(out.ads).toHaveLength(1);
  const ad = out.ads[0];
  if (ad.type !== "split") throw new Error("expected split");
  expect(ad.portrait.fileName).toBe("Lea 9x16.jpg");
  expect(ad.square.fileName).toBe("Lea.jpg");
  expect(ad.name).toBe("Creative 1");
});

test("ins gleiche Format geschnitten ersetzt das Bild nur", () => {
  const single: WizardAd = { id: "a", name: "Creative 1", type: "single", asset: image("Lea.jpg", "square") };
  const out = applyCrop({ ads: [single], loose: [] }, { adId: "a" }, image("Lea 1x1.jpg", "square"));
  expect(out.ads[0].type).toBe("single");
  expect(out.ads[0].type === "single" && out.ads[0].asset.fileName).toBe("Lea 1x1.jpg");
});

test("eine liegengebliebene Datei wird durch den Zuschnitt zum Paar", () => {
  const loose: WizardLooseAsset = { ...image("Lea.jpg", "portrait"), id: "l" };
  const out = applyCrop({ ads: [], loose: [loose] }, { looseId: "l" }, image("Lea 1x1.jpg", "square"));
  expect(out.loose).toHaveLength(0);
  expect(out.ads[0].type).toBe("split");
  expect(out.ads[0].type === "split" && out.ads[0].square.fileName).toBe("Lea 1x1.jpg");
});

test("beide Formate auf einmal: Einzelbild wird zum Paar aus zwei Ausschnitten", () => {
  const single: WizardAd = { id: "a", name: "Bild 1", type: "single", asset: image("Lea.jpg", "square") };
  const out = applyCrop({ ads: [single], loose: [] }, { adId: "a" }, [image("Lea 9x16.jpg", "portrait"), image("Lea 1x1.jpg", "square")]);
  const ad = out.ads[0];
  if (ad.type !== "split") throw new Error("expected split");
  expect(ad.portrait.fileName).toBe("Lea 9x16.jpg");
  expect(ad.square.fileName).toBe("Lea 1x1.jpg");
  const loose: WizardLooseAsset = { ...image("Lea.jpg", "portrait"), id: "l" };
  const fromLoose = applyCrop({ ads: [], loose: [loose] }, { looseId: "l" }, [image("Lea 1x1.jpg", "square"), image("Lea 9x16.jpg", "portrait")]);
  expect(ad.name).toBe("Creative 1");
  expect(fromLoose.loose).toHaveLength(0);
  expect(fromLoose.ads[0].type === "split" && fromLoose.ads[0].portrait.fileName).toBe("Lea 9x16.jpg");
});

test("in einem Paar ersetzt der Zuschnitt nur seine Hälfte", () => {
  const split: WizardAd = {
    id: "a",
    name: "Creative 1",
    type: "split",
    portrait: image("p.jpg", "portrait"),
    square: image("s.jpg", "square"),
  };
  const out = applyCrop({ ads: [split], loose: [] }, { adId: "a" }, image("s2.jpg", "square"));
  expect(out.ads[0].type === "split" && out.ads[0].square.fileName).toBe("s2.jpg");
  expect(out.ads[0].type === "split" && out.ads[0].portrait.fileName).toBe("p.jpg");
});

const brief: AssembledBrief = {
  taskId: "t1",
  clientName: { value: "MeVita Pflegedienst GmbH", sources: ["clickup"] },
  roles: { value: ["PFK"], sources: ["clickup"] },
  benefits: { value: "33 Urlaubstage\nJobrad", sources: ["onboarding"] },
  locations: { value: ["Mühlgasse 24, 71272 Renningen"], sources: ["clickup"] },
  formHint: { value: "Renningen", sources: ["clickup"] },
  dailyBudgetEuros: { value: 35, sources: ["clickup"] },
  spendCapEuros: { value: 2435, sources: ["clickup"] },
  driveFolderId: { value: "k", sources: ["clickup"] },
  notes: "neu anlegen",
  aiNotes: "",
  copyInstructions: "",
  warnings: [],
};

test("applyBrief setzt einen genannten Umkreis auf alle Gruppen, die noch auf 17 km stehen", () => {
  const s = applyBrief(initialState("act_1", "", "KF"), {
    ...brief,
    locations: { value: ["Renningen", "Stuttgart"], sources: ["clickup"] },
    radiusKm: { value: 30, sources: ["clickup"] },
  });
  expect(s.adSets.map((a) => a.radiusKm)).toEqual([30, 30]);
  // Ohne Nennung bleibt der Hausstandard – und damit die Reichweiten-Leiter an.
  expect(applyBrief(initialState("act_1", "", "KF"), brief).adSets[0].radiusKm).toBe(17);
});

test("applyBrief füllt ein leeres Formular und merkt sich je Feld die Herkunft", () => {
  const s = applyBrief(initialState("act_1", "", "KF"), brief);
  expect(s.business).toBe("MeVita Pflegedienst GmbH");
  expect(s.roles).toEqual(["PFK"]);
  expect(s.benefits).toBe("33 Urlaubstage\nJobrad");
  expect(s.adSets[0].addressString).toBe("Mühlgasse 24, 71272 Renningen");
  expect(s.dailyBudgetEuros).toBe(35);
  expect(s.spendCapEuros).toBe(2435);
  expect(s.taskId).toBe("t1");
  expect(s.notes).toBe("neu anlegen");
  expect(s.formHint).toBe("Renningen");
  expect(s.driveFolderId).toBe("k");
  expect(s.sources).toEqual({
    initials: ["session"],
    clientName: ["clickup"],
    roles: ["clickup"],
    benefits: ["onboarding"],
    location: ["clickup"],
    dailyBudget: ["clickup"],
    spendCap: ["clickup"],
  });
});

test("applyBrief: mehrere Standorte → je eine Anzeigengruppe, die weiteren spiegeln die erste", () => {
  const s = applyBrief(initialState("act_1", "", "KF"), {
    ...brief,
    locations: { value: ["Mühlgasse 24, 71272 Renningen", "Stuttgart-Vaihingen"], sources: ["clickup"] },
  });
  expect(s.adSets.map((a) => [a.name, a.addressString, a.mirrorOf === s.adSets[0].id])).toEqual([
    ["Ads", "Mühlgasse 24, 71272 Renningen", false],
    ["Ads – Stuttgart-Vaihingen", "Stuttgart-Vaihingen", true],
  ]);
});

test("cityOf nimmt den Ort hinter der PLZ", () => {
  expect(cityOf("Mühlgasse 24, 71272 Renningen")).toBe("Renningen");
  expect(cityOf("Stuttgart")).toBe("Stuttgart");
});

test("ein Spiegel-Standort bekommt jede eigene Anzeige der Quelle als Leihe – auch spätere", () => {
  const a = emptyAdSet(0);
  const b = { ...emptyAdSet(1, "Stuttgart"), mirrorOf: a.id };
  const ad: WizardAd = { id: "x", name: "Creative 1", type: "single", asset: image("s.jpg", "square") };
  const once = syncLinkedAds([{ ...a, ads: [ad] }, b]);
  expect(once[1].ads.map((x) => x.source)).toEqual([{ adSetId: a.id, adId: "x" }]);
  const twice = syncLinkedAds([{ ...once[0], ads: [ad, { ...ad, id: "y", name: "Creative 2" }] }, once[1]]);
  expect(twice[1].ads.map((x) => x.source?.adId)).toEqual(["x", "y"]);
});

test("applyBrief überschreibt nichts, was schon angefasst ist", () => {
  const before = {
    ...initialState("act_1", "Anderer Kunde", "KF"),
    roles: ["HK"],
    benefits: "eigene",
    dailyBudgetEuros: 20,
  };
  before.adSets[0].addressString = "Hier";
  const s = applyBrief(before, brief);
  expect(s.business).toBe("Anderer Kunde");
  expect(s.roles).toEqual(["HK"]);
  expect(s.benefits).toBe("eigene");
  expect(s.dailyBudgetEuros).toBe(20);
  expect(s.adSets[0].addressString).toBe("Hier");
  expect(s.spendCapEuros).toBe(2435);
  expect(s.sources).toEqual({ initials: ["session"], spendCap: ["clickup"] });
});

test("edited nimmt dem Feld sein Etikett", () => {
  const s = applyBrief(initialState("act_1", "", "KF"), brief);
  const t = edited(s, "roles", { roles: ["FK"] });
  expect(t.roles).toEqual(["FK"]);
  expect(t.sources.roles).toBeUndefined();
  expect(t.sources.benefits).toEqual(["onboarding"]);
});

test("das Tagesbudget beginnt beim Hausstandard", () => {
  expect(initialState().dailyBudgetEuros).toBe(DEFAULT_DAILY_BUDGET);
  expect(initialState().sources).toEqual({});
});

// --- Kampagnenkontext: Hinweise, mehrfache Herkunft, alte Entwürfe

const assembled = (patch: Partial<AssembledBrief> = {}): AssembledBrief => ({
  taskId: "t1",
  aiNotes: "Nur PFK",
  copyInstructions: "Ton sachlich.",
  roles: { value: ["PFK", "PA"], sources: ["clickup", "onboarding"] },
  dailyBudgetEuros: { value: 40, sources: ["user"] },
  benefits: { value: "Jobrad", sources: ["onboarding"] },
  locations: { value: ["Renningen"], sources: ["clickup"] },
  warnings: [],
  ...patch,
});

test("applyBrief übernimmt Hinweise, Textanweisungen und die Quellen als Liste", () => {
  const state = applyBrief(initialState("act_1"), assembled());
  expect(state.aiNotes).toBe("Nur PFK");
  expect(state.copyInstructions).toBe("Ton sachlich.");
  expect(state.roles).toEqual(["PFK", "PA"]);
  expect(state.sources.roles).toEqual(["clickup", "onboarding"]);
  expect(state.sources.dailyBudget).toEqual(["user"]);
  expect(state.sources.benefits).toEqual(["onboarding"]);
  expect(state.sources.location).toEqual(["clickup"]);
});

test("initialState kennt leere Hinweise und Textanweisungen", () => {
  const state = initialState("act_1", "", "JP");
  expect(state.aiNotes).toBe("");
  expect(state.copyInstructions).toBe("");
  expect(state.sources.initials).toEqual(["session"]);
});

test("hydrate ergänzt alte Entwürfe: fehlende Felder leer, einzelne Quellen als Liste", () => {
  const old = {
    ...initialState("act_1", "Herzhalt"),
    sources: { roles: "clickup", benefits: ["onboarding"] },
  } as unknown as WizardState;
  delete (old as Partial<WizardState>).aiNotes;
  delete (old as Partial<WizardState>).copyInstructions;
  const state = hydrate(old, "JP");
  expect(state.aiNotes).toBe("");
  expect(state.copyInstructions).toBe("");
  expect(state.sources).toEqual({ roles: ["clickup"], benefits: ["onboarding"] });
  expect(state.initials).toBe("JP");
});

test("textInstructions: Hinweise gehen auch ohne Aufgabe in die Texte, Textanweisungen davor", () => {
  expect(textInstructions({ ...initialState("act_1"), aiNotes: "Nur PFK" })).toBe("Nur PFK");
  expect(textInstructions({ ...initialState("act_1"), copyInstructions: "Ton sachlich.", aiNotes: "Nur PFK" })).toBe(
    "Ton sachlich.\nNur PFK",
  );
  expect(textInstructions({ ...initialState("act_1"), copyInstructions: " ", aiNotes: "" })).toBe("");
});

test("draftLabel: ein Entwurf, der nur aus Hinweisen besteht, heißt nach seiner ersten Hinweiszeile", () => {
  const draft = (state: WizardState): Draft => ({ id: "d", savedAt: 0, state });
  expect(draftLabel(draft({ ...initialState(), aiNotes: "Nur PFK, keine PDL\nBudget 40 €" }))).toBe("Nur PFK, keine PDL");
  expect(draftLabel(draft({ ...initialState("", "Herzhalt"), aiNotes: "Nur PFK" }))).toBe("Herzhalt");
  expect(draftLabel(draft(initialState()))).toBe("Ohne Kunde");
});

import { stateFromSeed, toAdInput } from "./state";
import type { CampaignSeed } from "@/lib/seed";

const seed: CampaignSeed = {
  campaignId: "c1",
  name: "Herzhalt Pflegedienst GmbH - PFK/PDL ab 12.08.26 MH (via One)",
  status: "ACTIVE",
  pageId: "p1",
  dailyBudgetEuros: 40,
  spendCapEuros: 500,
  warnings: [],
  adSets: [
    {
      metaId: "as1",
      name: "Ads",
      addressString: "Mühlgasse 24, 71272 Renningen",
      radiusKm: 25,
      formId: "f1",
      bodies: ["b1", "b2"],
      titles: ["t1"],
      description: "Das bieten wir:\n✅ JobRad\n✅ 30 Urlaubstage",
      ads: [
        { metaId: "ad1", name: "Laura 1", type: "ugc", asset: { kind: "video", videoId: "v1", fileName: "Laura 1" } },
        {
          metaId: "ad2",
          name: "Creative 1",
          type: "split",
          portrait: { kind: "image", hash: "hp", fileName: "Creative 1" },
          square: { kind: "image", hash: "hs", fileName: "Creative 1" },
        },
      ],
    },
  ],
};

test("stateFromSeed copy: same values, new name, no Meta ids", () => {
  const s = stateFromSeed(seed, { mode: "copy", adAccount: "act_1", business: "Herzhalt", initials: "JP" });
  expect(s.business).toBe("Herzhalt");
  expect(s.roles).toEqual(["PFK", "PDL"]);
  expect(s.campaignName).toBe("");
  expect(s.nameEdited).toBe(false);
  expect(s.editing).toBeUndefined();
  expect(s.dailyBudgetEuros).toBe(40);
  expect(s.spendCapEuros).toBe(500);
  expect(s.benefits).toBe("JobRad\n30 Urlaubstage");
  expect(s.sources).toEqual({
    clientName: ["campaign"],
    roles: ["campaign"],
    location: ["campaign"],
    dailyBudget: ["campaign"],
    spendCap: ["campaign"],
    initials: ["session"],
  });
  const [set] = s.adSets;
  expect(set.existingAdSetId).toBeUndefined();
  expect(set.addressString).toBe("Mühlgasse 24, 71272 Renningen");
  expect(set.radiusKm).toBe(25);
  expect(set.formId).toBe("f1");
  expect(set.bodies).toEqual(["b1", "b2"]);
  expect(set.ads.map((a) => [a.type, a.existingAdId])).toEqual([["ugc", undefined], ["split", undefined]]);
  expect(set.ads[0].type === "ugc" && set.ads[0].asset.orientation).toBe("portrait");
});

test("stateFromSeed edit: keeps name and Meta ids, business falls back to the name", () => {
  const s = stateFromSeed(seed, { mode: "edit", adAccount: "act_1", business: "", initials: "JP" });
  expect(s.business).toBe("Herzhalt Pflegedienst GmbH");
  expect(s.campaignName).toBe(seed.name);
  expect(s.nameEdited).toBe(true);
  expect(s.editing).toEqual({ campaignId: "c1", name: seed.name });
  expect(s.adSets[0].existingAdSetId).toBe("as1");
  expect(s.adSets[0].ads.map((a) => a.existingAdId)).toEqual(["ad1", "ad2"]);
  expect(toAdInput(s.adSets[0].ads[0]).existingAdId).toBe("ad1");
});

test("stateFromSeed without ad sets starts with one empty location", () => {
  const s = stateFromSeed({ ...seed, adSets: [] }, { mode: "copy", adAccount: "", business: "", initials: "" });
  expect(s.adSets).toHaveLength(1);
  expect(s.adSets[0].addressString).toBe("");
});

test("der wartende Anlegen-Knopf legt erst nach dem letzten Upload an – und bei Fehlern gar nicht", () => {
  expect(queuedLaunch({ running: 2, arriving: false, failed: 0 }, true)).toBe("wait");
  // Bei Meta fertig, aber noch nicht im Entwurf: der Stand wäre älter als Metas.
  expect(queuedLaunch({ running: 0, arriving: true, failed: 0 }, true)).toBe("wait");
  expect(queuedLaunch({ running: 0, arriving: false, failed: 0 }, false)).toBe("create");
  expect(queuedLaunch({ running: 0, arriving: false, failed: 1 }, false)).toBe("abort");
  expect(queuedLaunch({ running: 0, arriving: false, failed: 0 }, true)).toBe("abort");
});

// --- Der Brief in zwei Schritten: fester Stand, dann die Auflösung

test("reapplyBrief ersetzt nur, was die Auflösung anders sieht, und behält die IDs der Gruppen", () => {
  const partial = assembled({ roles: { value: ["PFK"], sources: ["clickup"] }, locations: { value: ["Renningen"], sources: ["clickup"] } });
  const before = applyBrief(initialState("act_1"), partial);
  const firstId = before.adSets[0].id;
  // Nichts anders → nichts neu zu schreiben.
  const same = reapplyBrief(before, partial, partial);
  expect(same.textsChanged).toBe(false);
  expect(same.state.adSets[0].id).toBe(firstId);
  // Genauere Adresse und andere Rollen → neu schreiben, dieselbe Gruppe.
  const final = assembled({
    roles: { value: ["PFK", "PDL"], sources: ["clickup", "onboarding"] },
    locations: { value: ["Mühlgasse 24, 71272 Renningen"], sources: ["clickup", "onboarding"] },
  });
  const out = reapplyBrief(before, partial, final);
  expect(out.textsChanged).toBe(true);
  expect(out.state.roles).toEqual(["PFK", "PDL"]);
  expect(out.state.sources.roles).toEqual(["clickup", "onboarding"]);
  expect(out.state.adSets[0].id).toBe(firstId);
  expect(out.state.adSets[0].addressString).toBe("Mühlgasse 24, 71272 Renningen");
  expect(out.state.sources.location).toEqual(["clickup", "onboarding"]);
});

test("duplicateAdSet kopiert Texte, Formular und Radius, spiegelt die Anzeigen und lässt die Adresse leer", () => {
  const src = { ...emptyAdSet(0), addressString: "Renningen", radiusKm: 25, formId: "f1", bodies: ["a", "b"], titles: ["t"], description: "d" };
  const sets = duplicateAdSet([src], 0);
  expect(sets).toHaveLength(2);
  const copy = sets[1];
  expect(copy.id).not.toBe(src.id);
  expect(copy.name).toBe(`${src.name} (Kopie)`);
  expect(copy.addressString).toBe("");
  expect(copy.radiusKm).toBe(25);
  expect(copy.formId).toBe("f1");
  expect(copy.bodies).toEqual(["a", "b"]);
  expect(copy.mirrorOf).toBe(src.id);
  expect(duplicateAdSet([src], 3)).toEqual([src]);
});

test("firstScreen und hasWork", () => {
  expect(firstScreen({ stepIndex: 0, manual: false, business: "", taskId: undefined })).toBe("list");
  expect(firstScreen({ stepIndex: 0, manual: true, business: "", taskId: undefined })).toBe("customer");
  expect(firstScreen({ stepIndex: 0, manual: false, business: "X", taskId: undefined })).toBe("customer");
  expect(firstScreen({ stepIndex: 1, manual: false, business: "", taskId: undefined })).toBe("other");
  expect(hasWork(initialState("act_1"))).toBe(false);
  expect(hasWork(ready({ adSets: [{ ...emptyAdSet(0), bodies: ["Text"] }] }))).toBe(true);
});
