/**
 * Aus abgelegten Dateien werden Anzeigen – ohne dass jemand vorher einen Modus
 * wählt. Die drei Inhaltsformen der Agentur (nur UGC, nur Creatives, gemischt)
 * sind keine Typen: weil eine Anzeigengruppe beides tragen kann, hängt die
 * Unterscheidung an der einzelnen Anzeige und lässt sich aus den Dateien lesen.
 *
 * Reine Logik, kein Upload, kein React – deshalb ohne Graph testbar.
 */

export type Orientation = "portrait" | "square";
export type MediaKind = "video" | "image";

/**
 * 9:16 ist 0,5625, Metas anderes empfohlenes Feed-Format 4:5 ist 0,8. Die
 * Grenze dazwischen trennt beide sauber: 4:5, 1:1 und 16:9 landen auf der
 * Square-Seite, wo sie hingehören. Konstante, keine Einstellung.
 */
export const PORTRAIT_MAX_RATIO = 0.7;

export function orientationOf(width: number, height: number): Orientation {
  // Unlesbare Maße als "square" zu behandeln ist die harmlosere Annahme: die
  // Datei landet dann im Paar-Zwang statt still als UGC-Anzeige durchzurutschen.
  if (!(width > 0 && height > 0)) return "square";
  return width / height < PORTRAIT_MAX_RATIO ? "portrait" : "square";
}

/** Das Minimum, das Klassifizierung und Paarung brauchen. */
export type Classified = {
  fileName: string;
  kind: MediaKind;
  orientation: Orientation;
};

export type PlannedAd<T> =
  | { type: "ugc"; asset: T }
  | { type: "split"; portrait: T; square: T; reason?: string };

/**
 * "Elisabeth 5.MOV" → "Elisabeth 5". Der Name der Anzeige steht später in Metas
 * Anzeigenliste; eine Dateiendung sagt dort niemandem etwas.
 */
export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "").trim() || fileName.trim();
}

/**
 * Kürzel, die in Dateinamen groß geschrieben bleiben. Ohne diese Liste würde die
 * Regel unten aus "UGC" ein "Ugc" machen. Erweitern heißt: Wort hier eintragen,
 * in der Schreibweise, in der es in Meta stehen soll – verglichen wird ohne
 * Rücksicht auf Groß- und Kleinschreibung, ein "ugc" im Dateinamen wird dadurch
 * ebenfalls zu "UGC".
 */
export const KEEP_CAPS = ["UGC", "HKP", "PDL", "FSJ", "MA"];

const KEPT = new Map(KEEP_CAPS.map((w) => [w.toLowerCase(), w]));

function capitalize(part: string): string {
  const kept = KEPT.get(part.toLowerCase());
  if (kept) return kept;
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

/**
 * "Lea1.mov", "lea1.MP4", "Lea 1.mov" und "LEA  1.mov" sind dieselbe Person und
 * werden in Metas Anzeigenliste sonst zu vier Namen, die sich in der Auswertung
 * nicht mehr zusammenfassen lassen. Bindestriche bleiben stehen – "Anna-Lena"
 * ist ein Name und keine Trennung.
 */
export function normalizeAdName(fileName: string): string {
  const stem = stripExtension(fileName);
  const spaced = stem
    .replace(/_+/g, " ")
    // \p{L} statt [a-z]: sonst zerfiele "Jörg2" zu "Jör g2".
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const out = spaced
    .split(" ")
    .map((word) => word.split("-").map(capitalize).join("-"))
    .join(" ");
  return out || stem;
}

/** "Creative 3.jpg" → { prefix: "creative", n: 3 }; ohne Zahl am Ende: null. */
function parseName(fileName: string): { prefix: string; n: number } | null {
  const stem = stripExtension(fileName);
  const m = /^(.*?)(\d+)$/.exec(stem);
  return m ? { prefix: m[1].trim().toLowerCase(), n: Number(m[2]) } : null;
}

/**
 * Die Dateien kommen aus einem Sammelordner, in dem "Creative 3" und
 * "Creative 4" die beiden Hälften einer Anzeige sind – benachbarte Nummern,
 * kein gemeinsamer Namensrest. Die Namen "können extrem abweichen", deshalb ist
 * das ein Vorschlag und nie eine Regel: was nicht sicher zusammengehört, bleibt
 * ungepaart liegen und wird von Hand zusammengezogen.
 */
export function pairByName<T extends Classified>(
  images: T[],
): { pairs: PlannedAd<T>[]; unpaired: T[] } {
  const numbered = images
    .map((asset) => ({ asset, parsed: parseName(asset.fileName) }))
    .filter((x): x is { asset: T; parsed: { prefix: string; n: number } } => x.parsed !== null)
    .sort((a, b) =>
      a.parsed.prefix === b.parsed.prefix
        ? a.parsed.n - b.parsed.n
        : a.parsed.prefix.localeCompare(b.parsed.prefix),
    );

  const used = new Set<T>();
  const pairs: PlannedAd<T>[] = [];

  for (let i = 0; i < numbered.length - 1; i++) {
    const a = numbered[i];
    const b = numbered[i + 1];
    if (used.has(a.asset) || used.has(b.asset)) continue;
    if (a.parsed.prefix !== b.parsed.prefix) continue;
    if (b.parsed.n - a.parsed.n !== 1) continue;
    // Zwei Hochformate nebeneinander sind kein Paar, sondern zwei Anzeigen.
    if (a.asset.orientation === b.asset.orientation) continue;

    const [portrait, square] =
      a.asset.orientation === "portrait" ? [a.asset, b.asset] : [b.asset, a.asset];
    used.add(a.asset);
    used.add(b.asset);
    pairs.push({
      type: "split",
      portrait,
      square,
      reason: `adjacent names: ${a.asset.fileName}, ${b.asset.fileName}`,
    });
  }

  return { pairs, unpaired: images.filter((a) => !used.has(a)) };
}

/**
 * Videos sind immer UGC – sie werden nie automatisch gepaart. Bilder sind immer
 * Hälften eines Paares: wer sich fotografiert, dreht kein UGC. Was übrig bleibt,
 * ist ein Fehlerzustand und keine still veröffentlichte Ein-Format-Anzeige.
 */
export function planAds<T extends Classified>(
  assets: T[],
): { ads: PlannedAd<T>[]; unpaired: T[] } {
  const ads: PlannedAd<T>[] = [];
  const images: T[] = [];

  for (const asset of assets) {
    if (asset.kind === "video") ads.push({ type: "ugc", asset });
    else images.push(asset);
  }

  const { pairs, unpaired } = pairByName(images);
  return { ads: [...ads, ...pairs], unpaired };
}

/** Split-Anzeigen heißen "Creative N", je Anzeigengruppe durchnummeriert. */
export function nextCreativeName(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) {
    const name = `Creative ${n}`;
    if (!used.has(name)) return name;
  }
}

/**
 * Ohne Endung fallen "Laura 1.mov" und "Laura 1.mp4" auf denselben Namen
 * zusammen. Zwei gleich heißende Anzeigen nimmt Meta an, in der Auswertung sind
 * sie danach aber nicht mehr auseinanderzuhalten.
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const name = `${base} (${n})`;
    if (!used.has(name)) return name;
  }
}
