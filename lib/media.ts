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

/**
 * Die anzeigbare Adresse eines hochgeladenen Bildes. Meta gibt beim Upload nur
 * einen Hash zurück; app/api/image löst ihn auf und liefert das Bild über den
 * eigenen Server aus – gleicher Ursprung, damit der Zuschnitt es ins Canvas
 * legen darf.
 */
export const imagePreviewUrl = (hash: string, adAccount: string) =>
  `/api/image?hash=${encodeURIComponent(hash)}&adAccount=${encodeURIComponent(adAccount)}`;

/** Das Minimum, das Klassifizierung und Paarung brauchen. */
export type Classified = {
  fileName: string;
  kind: MediaKind;
  orientation: Orientation;
  /** 64-Bit-dHash des mittigen Quadrats, hex – siehe fingerprintOf() in upload-queue.tsx. */
  fingerprint?: string;
  /** Die Überschrift im Bild, von Mistral gelesen – siehe lib/headline.ts. */
  headline?: string;
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
 * Was Drive, Finder und Explorer beim Duplizieren an den Namen hängen. Der
 * Sammelordner ist voll davon, und ohne diese Reinigung steht „Kopie von
 * Lea 1 (1)“ in Metas Anzeigenliste – oder schlimmer: die Klammer verdeckt die
 * Nummer, an der pairImages() die beiden Hälften einer Anzeige erkennt.
 *
 * Der Zähler ist bewusst auf zwei Stellen begrenzt: „Sommer (2024)“ ist eine
 * Jahreszahl und keine dritte Kopie.
 */
const COPY_PREFIX = /^(?:kopie von|copy of)\s+/i;
const COPY_SUFFIX = /(?:[\s._-]*(?:\(\s*\d{1,2}\s*\)|(?:-\s*)?(?:kopie|copy)(?:\s*\d{1,2})?))+$/i;

/**
 * Der Dateiname ohne Endung und ohne Kopierspuren. Bleibt davon nichts übrig,
 * gilt der Stamm – eine Datei, die wirklich „Kopie.jpg“ heißt, wird nicht
 * namenlos.
 */
export function cleanStem(fileName: string): string {
  const stem = stripExtension(fileName);
  return stem.replace(COPY_PREFIX, "").replace(COPY_SUFFIX, "").trim() || stem;
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
  const stem = cleanStem(fileName);
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

/**
 * Wie der Sammelordner ein Format in den Namen schreibt: „Lea 9x16.jpg“ und
 * „Lea 1x1.jpg“, „creative_story“ / „creative_feed“, „Hochformat“ /
 * „Quadrat“. Der Rest des Namens ist dann der Schlüssel, unter dem die beiden
 * Hälften zusammenfinden.
 */
const PORTRAIT_TOKEN =
  /(?:^|[\s._\-()[\]])(?:9\s*[x×:\-_]\s*16|1080\s*[x×]\s*1920|story|stories|storys|reels?|hoch(?:format|kant)?|portrait|vertical|vertikal)(?=$|[\s._\-()[\]])/i;
const SQUARE_TOKEN =
  /(?:^|[\s._\-()[\]])(?:1\s*[x×:\-_]\s*1|4\s*[x×:\-_]\s*5|1080\s*[x×]\s*(?:1080|1350)|feed|post|quadrat(?:isch)?|square|quer)(?=$|[\s._\-()[\]])/i;

/**
 * Formatkürzel aus dem Namensstamm lesen und entfernen. Nach dem Zuschnitt
 * heißt eine Datei „Lea 9x16.jpg“; ohne diese Funktion hieße der zweite
 * Zuschnitt „Lea 9x16 1x1.jpg“ und die Paarung sähe zwei verschiedene Stämme.
 */
export function splitFormatToken(fileName: string): { stem: string; format?: Orientation } {
  const stem = cleanStem(fileName);
  for (const [re, format] of [
    [PORTRAIT_TOKEN, "portrait"],
    [SQUARE_TOKEN, "square"],
  ] as const) {
    const m = re.exec(stem);
    if (!m) continue;
    const bare = (stem.slice(0, m.index) + " " + stem.slice(m.index + m[0].length))
      .replace(/[\s._\-]+$/, "")
      .replace(/^[\s._\-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    return { stem: bare || stem, format };
  }
  return { stem };
}

/** Der Schlüssel, unter dem Namen verglichen werden: ohne Endung, Kopierspur, Kürzel, Groß-/Kleinschreibung. */
const nameKey = (s: string) => s.toLowerCase().replace(/[\s._\-]+/g, " ").trim();

/** "Creative 3.jpg" → { prefix: "creative", n: 3 }; ohne Zahl am Ende: null. */
function parseName(fileName: string): { prefix: string; n: number } | null {
  const stem = splitFormatToken(fileName).stem;
  const m = /^(.*?)(\d+)$/.exec(stem);
  return m ? { prefix: nameKey(m[1]), n: Number(m[2]) } : null;
}

/**
 * Überschriften vergleichbar machen: „Pflege, die Zeit lässt.“ und „PFLEGE
 * DIE ZEIT LÄSST“ sind dieselbe. Unter vier Buchstaben ist es keine Überschrift,
 * sondern ein Logo oder ein Lesefehler – und die würde alles mit allem paaren.
 */
export function headlineKey(headline?: string): string | undefined {
  const key = (headline ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return key.replace(/ /g, "").length >= 4 ? key : undefined;
}

/** Hamming-Abstand zweier Hex-Fingerabdrücke; Infinity, wenn einer fehlt. */
export function fingerprintDistance(a?: string, b?: string): number {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/**
 * Bis zu wie vielen abweichenden Bits (von 64) zwei Bilder als dasselbe Motiv
 * gelten. Ein 9:16- und ein 1:1-Export derselben Aufnahme teilen sich das
 * mittige Quadrat nur ungefähr – der 1:1-Schnitt zeigt meist mehr Breite.
 * Deshalb großzügiger als die üblichen 10.
 */
// ponytail: dHash auf dem mittigen Quadrat, feste Schwelle. Reicht für Exporte
// derselben Aufnahme; wer Motive mit anderem Bildausschnitt paaren will,
// braucht Merkmale statt Pixel (z. B. ein Embedding).
export const SIMILAR_BELOW = 16;

type Rule<T> = {
  reason: string;
  /** Beide sind schon gegensätzlich ausgerichtet – hier zählt nur der Name/Inhalt. */
  match: (a: T, b: T) => boolean;
  /** Kleiner ist besser; nur für die Reihenfolge, wenn mehrere passen. */
  score?: (a: T, b: T) => number;
};

/**
 * Die Regeln, in der Reihenfolge ihrer Verlässlichkeit. Jede läuft über alle
 * noch ungepaarten Bilder; was sie bindet, sieht die nächste nicht mehr.
 */
const RULES: Rule<Classified>[] = [
  {
    reason: "Gleicher Name mit Formatkürzel",
    match: (a, b) => {
      const x = splitFormatToken(a.fileName);
      const y = splitFormatToken(b.fileName);
      return Boolean(x.format && y.format) && nameKey(x.stem) === nameKey(y.stem);
    },
  },
  {
    reason: "Gleicher Dateiname",
    match: (a, b) => nameKey(splitFormatToken(a.fileName).stem) === nameKey(splitFormatToken(b.fileName).stem),
  },
  {
    // Ein PDF-Export heißt „page-1“ bis „page-12“; die Nummern sagen nichts,
    // die Überschrift im Bild sagt alles.
    reason: "Gleiche Überschrift",
    match: (a, b) => {
      const x = headlineKey(a.headline);
      const y = headlineKey(b.headline);
      return Boolean(x && y) && x === y;
    },
  },
  {
    reason: "Benachbarte Nummern",
    match: (a, b) => {
      const x = parseName(a.fileName);
      const y = parseName(b.fileName);
      return Boolean(x && y) && x!.prefix === y!.prefix && Math.abs(x!.n - y!.n) === 1;
    },
    // Bei 1,2,3,4 gehören 1–2 und 3–4 zusammen, nicht 2–3: das Paar mit der
    // kleineren Nummer zuerst, damit die Reihe von vorn aufgeht.
    score: (a, b) => Math.min(parseName(a.fileName)!.n, parseName(b.fileName)!.n),
  },
  {
    reason: "Ähnliches Motiv",
    match: (a, b) => fingerprintDistance(a.fingerprint, b.fingerprint) < SIMILAR_BELOW,
    score: (a, b) => fingerprintDistance(a.fingerprint, b.fingerprint),
  },
];

/**
 * Ob ein Paar vom Assistenten vorgeschlagen wurde – und nicht von Hand
 * gebildet oder zugeschnitten. Nur Vorschläge darf withArrivedAssets() wieder
 * auflösen, wenn spätere Dateien eine bessere Paarung ergeben.
 */
export function isSuggestedPair(reason?: string): boolean {
  return Boolean(reason && RULES.some((r) => reason.startsWith(`${r.reason}: `)));
}

/**
 * Die Dateien kommen aus einem Sammelordner, in dem die beiden Hälften einer
 * Anzeige mal „Creative 3“ und „Creative 4“ heißen, mal „Lea 9x16“ und
 * „Lea 1x1“, mal beide gleich – und mal gar nichts Gemeinsames haben außer
 * dem Motiv. Vier Regeln, von der sichersten zur weichsten; jede paart nur
 * Hochformat mit Quadrat, und jedes Paar trägt seinen Grund, damit ein
 * falscher Vorschlag auffällt statt unbemerkt zu bleiben. Was keine Regel
 * bindet, bleibt liegen und wird von Hand zusammengezogen.
 */
export function pairImages<T extends Classified>(
  images: T[],
): { pairs: PlannedAd<T>[]; unpaired: T[] } {
  const used = new Set<T>();
  const pairs: PlannedAd<T>[] = [];

  for (const rule of RULES) {
    const portraits = images.filter((i) => !used.has(i) && i.orientation === "portrait");
    const squares = images.filter((i) => !used.has(i) && i.orientation === "square");
    const candidates: { p: T; s: T; score: number }[] = [];
    for (const p of portraits)
      for (const s of squares)
        if (rule.match(p, s)) candidates.push({ p, s, score: rule.score?.(p, s) ?? 0 });
    candidates.sort((x, y) => x.score - y.score);
    for (const { p, s } of candidates) {
      if (used.has(p) || used.has(s)) continue;
      used.add(p);
      used.add(s);
      pairs.push({
        type: "split",
        portrait: p,
        square: s,
        reason: `${rule.reason}: ${cleanStem(p.fileName)}, ${cleanStem(s.fileName)}`,
      });
    }
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

  const { pairs, unpaired } = pairImages(images);
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
