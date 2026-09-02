import { expect, test } from "bun:test";
import {
  cleanStem,
  nextCreativeName,
  stripExtension,
  uniqueName,
  orientationOf,
  pairImages,
  splitFormatToken,
  planAds,
  normalizeAdName,
  KEEP_CAPS,
  headlineKey,
  isSuggestedPair,
  type Classified,
} from "./media";

const img = (fileName: string, orientation: "portrait" | "square"): Classified => ({
  fileName,
  kind: "image",
  orientation,
});
const vid = (fileName: string): Classified => ({
  fileName,
  kind: "video",
  orientation: "portrait",
});

test("9:16 is portrait, 1:1 and 16:9 are square", () => {
  expect(orientationOf(1080, 1920)).toBe("portrait");
  expect(orientationOf(1080, 1080)).toBe("square");
  expect(orientationOf(3840, 2160)).toBe("square");
});

test("4:5 counts as square, because that is a feed format", () => {
  // 0.8 liegt über der Grenze – sonst landete ein Feed-Bild im Story-Bucket.
  expect(orientationOf(1080, 1350)).toBe("square");
});

test("unreadable dimensions fall back to square, so the file must be paired", () => {
  expect(orientationOf(0, 0)).toBe("square");
});

test("adjacent numbers pair up, and the portrait half is identified", () => {
  const { pairs, unpaired } = pairImages([
    img("Creative 4.jpg", "square"),
    img("Creative 3.jpg", "portrait"),
  ]);
  expect(unpaired).toHaveLength(0);
  expect(pairs).toHaveLength(1);
  const pair = pairs[0];
  if (pair.type !== "split") throw new Error("expected a split");
  expect(pair.portrait.fileName).toBe("Creative 3.jpg");
  expect(pair.square.fileName).toBe("Creative 4.jpg");
  expect(pair.reason).toContain("Benachbarte Nummern");
});

test("two separate pairs are found in one drop", () => {
  const { pairs, unpaired } = pairImages([
    img("Creative 3.jpg", "portrait"),
    img("Creative 4.jpg", "square"),
    img("Creative 5.jpg", "portrait"),
    img("Creative 6.jpg", "square"),
  ]);
  expect(pairs).toHaveLength(2);
  expect(unpaired).toHaveLength(0);
});

test("different name stems never pair, however close the numbers", () => {
  const { pairs, unpaired } = pairImages([
    img("Creative 3.jpg", "portrait"),
    img("Laura 4.jpg", "square"),
  ]);
  expect(pairs).toHaveLength(0);
  expect(unpaired).toHaveLength(2);
});

test("two portraits in a row are not a pair", () => {
  const { pairs, unpaired } = pairImages([
    img("Creative 3.jpg", "portrait"),
    img("Creative 4.jpg", "portrait"),
  ]);
  expect(pairs).toHaveLength(0);
  expect(unpaired).toHaveLength(2);
});

test("a leftover image is left unpaired rather than guessed at", () => {
  const { pairs, unpaired } = pairImages([
    img("Creative 3.jpg", "portrait"),
    img("Creative 4.jpg", "square"),
    img("Creative 9.jpg", "square"),
  ]);
  expect(pairs).toHaveLength(1);
  expect(unpaired.map((u) => u.fileName)).toEqual(["Creative 9.jpg"]);
});

test("names without a trailing number never auto-pair", () => {
  const { pairs, unpaired } = pairImages([
    img("hochformat.jpg", "portrait"),
    img("quadrat.jpg", "square"),
  ]);
  expect(pairs).toHaveLength(0);
  expect(unpaired).toHaveLength(2);
});

test("every video becomes its own UGC ad and is never paired", () => {
  const { ads, unpaired } = planAds([vid("Laura 1.mp4"), vid("Laura 2.mp4")]);
  expect(unpaired).toHaveLength(0);
  expect(ads).toHaveLength(2);
  expect(ads.every((a) => a.type === "ugc")).toBe(true);
});

test("videos and images in one drop become UGC ads and a split, side by side", () => {
  const { ads, unpaired } = planAds([
    vid("Laura 1.mp4"),
    img("Creative 3.jpg", "portrait"),
    img("Creative 4.jpg", "square"),
  ]);
  expect(unpaired).toHaveLength(0);
  expect(ads.filter((a) => a.type === "ugc")).toHaveLength(1);
  expect(ads.filter((a) => a.type === "split")).toHaveLength(1);
});

test("two adjacent videos stay two UGC ads, even though a pair would fit", () => {
  // Q1 der Abstimmung: Videos sind immer UGC. Paaren geht nur von Hand.
  const { ads } = planAds([
    { fileName: "Creative 3.mp4", kind: "video", orientation: "portrait" },
    { fileName: "Creative 4.mp4", kind: "video", orientation: "square" },
  ]);
  expect(ads).toHaveLength(2);
  expect(ads.every((a) => a.type === "ugc")).toBe(true);
});

test("creative names fill the first free number", () => {
  expect(nextCreativeName([])).toBe("Creative 1");
  expect(nextCreativeName(["Creative 1", "Creative 2"])).toBe("Creative 3");
  // Eine geliehene Anzeige behält ihren Namen; lokale zählen darum herum.
  expect(nextCreativeName(["Creative 1", "Creative 3"])).toBe("Creative 2");
});

test("the ad name is the file name without its extension", () => {
  // "Elisabeth 5.MOV" stand so in Metas Anzeigenliste – die Endung sagt dort
  // niemandem etwas.
  expect(stripExtension("Elisabeth 5.MOV")).toBe("Elisabeth 5");
  expect(stripExtension("Creative 3.jpeg")).toBe("Creative 3");
  // Punkte im Namen bleiben, nur die letzte Endung fällt weg.
  expect(stripExtension("Laura 2.1 final.mp4")).toBe("Laura 2.1 final");
  // Ohne Endung bleibt der Name, wie er ist.
  expect(stripExtension("Laura 1")).toBe("Laura 1");
  // Eine Datei, die nur aus einer Endung besteht, darf nicht namenlos werden.
  expect(stripExtension(".mp4")).toBe(".mp4");
});

test("Spuren des Kopierens stehen nicht in Metas Anzeigenliste", () => {
  // Was aus Drive, Finder und Explorer im Sammelordner landet.
  expect(cleanStem("Kopie von Lea 1.mp4")).toBe("Lea 1");
  expect(cleanStem("Copy of Lea 1.mp4")).toBe("Lea 1");
  expect(cleanStem("Lea 1 (1).mp4")).toBe("Lea 1");
  expect(cleanStem("Lea 1 - Kopie.mp4")).toBe("Lea 1");
  expect(cleanStem("Lea 1 copy.mp4")).toBe("Lea 1");
  // Beides zusammen, in beiden Reihenfolgen.
  expect(cleanStem("Lea 1 - Kopie (2).mp4")).toBe("Lea 1");
  expect(cleanStem("Lea 1 copy 2.mp4")).toBe("Lea 1");
});

test("die Nummer am Ende überlebt, sie trägt die Paarung", () => {
  // "Creative 3" und "Creative 4" sind die beiden Hälften einer Anzeige – eine
  // Reinigung, die die 3 mitnimmt, zerstört genau das.
  expect(cleanStem("Creative 3.jpg")).toBe("Creative 3");
  // Vierstellige Klammern sind keine Kopienzähler.
  expect(cleanStem("Sommer (2024).jpg")).toBe("Sommer (2024)");
  // Ein Name, der nur aus Kopierspuren besteht, bleibt lieber stehen.
  expect(cleanStem("Kopie.jpg")).toBe("Kopie");
});

test("ein kopiertes Paar findet trotzdem zusammen", () => {
  // Vorher scheiterte das an der Klammer: "Creative 3 (1)" endet nicht auf einer
  // Ziffer und wurde nie als Nummer gelesen.
  const { pairs, unpaired } = pairImages([
    img("Creative 3 (1).jpg", "portrait"),
    img("Creative 4.jpg", "square"),
  ]);
  expect(unpaired).toHaveLength(0);
  expect(pairs).toHaveLength(1);
});

test("der Anzeigenname trägt die Kopierspur nicht weiter", () => {
  expect(normalizeAdName("Kopie von lea1.mov")).toBe("Lea 1");
  expect(normalizeAdName("lea1 (1).mov")).toBe("Lea 1");
});

test("two files that collide after stripping keep distinct ad names", () => {
  // "Laura 1.mov" und "Laura 1.mp4" fielen sonst auf denselben Namen zusammen
  // und wären in der Auswertung nicht mehr auseinanderzuhalten.
  const taken = new Set<string>();
  const first = uniqueName("Laura 1", taken);
  taken.add(first);
  const second = uniqueName("Laura 1", taken);
  expect(first).toBe("Laura 1");
  expect(second).toBe("Laura 1 (2)");
});

test("die Normalisierung nimmt uniqueName nicht die Arbeit ab", () => {
  // In dieser Reihenfolge ruft ad-set-block.tsx es auf, und nur so herum stimmt
  // die Entdopplung: uniqueName sieht die endgültige Schreibweise. Die
  // Normalisierung erzeugt dabei absichtlich *mehr* Kollisionen – "Lea1.mov",
  // "lea 1.mp4" und "LEA  1.MOV" laufen alle auf "Lea 1" zu –, also muss sie
  // hinterher greifen, sonst trügen zwei Anzeigen denselben Namen.
  const taken = new Set<string>();
  const names = ["Lea 1.mov", "Lea 1.mp4", "lea1.MOV"].map((f) => {
    const name = uniqueName(normalizeAdName(f), taken);
    taken.add(name);
    return name;
  });
  expect(names).toEqual(["Lea 1", "Lea 1 (2)", "Lea 1 (3)"]);
});

test("dieselbe Person bekommt aus jeder Schreibweise denselben Namen", () => {
  for (const f of ["Lea1.mov", "lea1.MP4", "Lea 1.mov", "LEA  1.mov", "lea_1.mp4"])
    expect(normalizeAdName(f)).toBe("Lea 1");
});

test("Bindestrich-Namen und mehrteilige Namen bleiben lesbar", () => {
  expect(normalizeAdName("anna-lena2.mov")).toBe("Anna-Lena 2");
  expect(normalizeAdName("anna maria 3.mov")).toBe("Anna Maria 3");
  expect(normalizeAdName("jörg2.mov")).toBe("Jörg 2");
});

test("Kürzel aus der Liste behalten ihre Großschreibung, der Rest nicht", () => {
  expect(normalizeAdName("UGC lea1.mov")).toBe("UGC Lea 1");
  expect(normalizeAdName("ugc Lea1.mov")).toBe("UGC Lea 1");
  expect(KEEP_CAPS).toContain("UGC");
  // Ganze Wörter, kein Textbestandteil: sonst würde aus "Maria" ein "MAria".
  expect(normalizeAdName("maria 1.mov")).toBe("Maria 1");
  expect(normalizeAdName("ma 2.mov")).toBe("MA 2");
});

test("ein Name, der zu nichts normalisiert, behält seinen Stamm", () => {
  expect(normalizeAdName("___.mov")).toBe("___");
});

test("Formatkürzel im Namen paaren, egal wie sie geschrieben sind", () => {
  const { pairs, unpaired } = pairImages([
    img("Lea_9x16.jpg", "portrait"),
    img("Lea 1x1.png", "square"),
    img("Praxis-story.jpg", "portrait"),
    img("Praxis feed.jpg", "square"),
    img("Team (Hochformat).jpg", "portrait"),
    img("Team (Quadrat).jpg", "square"),
  ]);
  expect(unpaired).toHaveLength(0);
  expect(pairs.map((p) => p.type === "split" && p.portrait.fileName)).toEqual([
    "Lea_9x16.jpg",
    "Praxis-story.jpg",
    "Team (Hochformat).jpg",
  ]);
  expect(pairs[0].type === "split" && pairs[0].reason).toContain("Formatkürzel");
});

test("gleicher Stamm, andere Endung oder Kopierspur: ein Paar", () => {
  const { pairs, unpaired } = pairImages([
    img("Lea.jpg", "portrait"),
    img("Lea (1).png", "square"),
  ]);
  expect(pairs).toHaveLength(1);
  expect(unpaired).toHaveLength(0);
});

test("eine Reihe 1–4 wird 1–2 und 3–4, nicht 2–3", () => {
  const { pairs } = pairImages([
    img("C 2.jpg", "square"),
    img("C 3.jpg", "portrait"),
    img("C 1.jpg", "portrait"),
    img("C 4.jpg", "square"),
  ]);
  const halves = pairs.map((p) => p.type === "split" && [p.portrait.fileName, p.square.fileName]);
  expect(halves).toEqual([
    ["C 1.jpg", "C 2.jpg"],
    ["C 3.jpg", "C 4.jpg"],
  ]);
});

test("ähnliche Fingerabdrücke paaren, unähnliche nicht", () => {
  const a = { ...img("IMG_0001.jpg", "portrait"), fingerprint: "ff00ff00ff00ff00" };
  const b = { ...img("DSC_9921.jpg", "square"), fingerprint: "ff00ff00ff00ff01" };
  const c = { ...img("DSC_9922.jpg", "square"), fingerprint: "00ff00ff00ff00ff" };
  const { pairs, unpaired } = pairImages([a, c, b]);
  expect(pairs).toHaveLength(1);
  expect(pairs[0].type === "split" && pairs[0].square.fileName).toBe("DSC_9921.jpg");
  expect(pairs[0].type === "split" && pairs[0].reason).toContain("Ähnliches Motiv");
  expect(unpaired.map((u) => u.fileName)).toEqual(["DSC_9922.jpg"]);
});

test("der Name gewinnt vor dem Motiv", () => {
  const a = { ...img("Creative 3.jpg", "portrait"), fingerprint: "0000000000000000" };
  const b = { ...img("Creative 4.jpg", "square"), fingerprint: "ffffffffffffffff" };
  const c = { ...img("Sonstiges.jpg", "square"), fingerprint: "0000000000000000" };
  const { pairs } = pairImages([a, b, c]);
  expect(pairs[0].type === "split" && pairs[0].square.fileName).toBe("Creative 4.jpg");
});

test("splitFormatToken trennt Kürzel vom Stamm und lässt Jahreszahlen in Ruhe", () => {
  expect(splitFormatToken("Lea 9x16.jpg")).toEqual({ stem: "Lea", format: "portrait" });
  expect(splitFormatToken("Lea 9x16 1x1.jpg").stem).toBe("Lea 1x1");
  expect(splitFormatToken("Sommer 2024.jpg")).toEqual({ stem: "Sommer 2024" });
  expect(splitFormatToken("story.jpg")).toEqual({ stem: "story", format: "portrait" });
});

test("die Überschrift im Bild paart, wenn die Namen nichts sagen", () => {
  const withHeadline = (name: string, o: "portrait" | "square", headline?: string) => ({ ...img(name, o), headline });
  const { pairs, unpaired } = pairImages([
    withHeadline("page-1.png", "portrait", "Pflege, die Zeit lässt."),
    withHeadline("page-2.png", "square", "WIR SUCHEN DICH"),
    withHeadline("page-3.png", "portrait", "Wir suchen dich!"),
    withHeadline("page-4.png", "square", "pflege die zeit lässt"),
    withHeadline("page-5.png", "portrait", "MA"),
    withHeadline("page-6.png", "square", "MA"),
  ]);
  const names = pairs.map((p) => p.type === "split" && `${p.portrait.fileName}+${p.square.fileName}`).sort();
  expect(names).toEqual(["page-1.png+page-4.png", "page-3.png+page-2.png", "page-5.png+page-6.png"]);
  const reasonOf = (portrait: string) =>
    pairs.map((p) => (p.type === "split" && p.portrait.fileName === portrait ? p.reason : undefined)).find(Boolean);
  expect(reasonOf("page-1.png")).toMatch(/^Gleiche Überschrift/);
  // 5 und 6: die Überschrift ist zu kurz, die Nachbarschaft bleibt.
  expect(reasonOf("page-5.png")).toMatch(/^Benachbarte Nummern/);
  expect(unpaired).toEqual([]);
  expect(headlineKey("  Ab  ")).toBeUndefined();
  expect(isSuggestedPair("Gleiche Überschrift: a, b")).toBe(true);
  expect(isSuggestedPair("Aus einem Bild zugeschnitten: a")).toBe(false);
});
