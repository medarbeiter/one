/**
 * Die Onboarding-Tabelle als Raster: schwarze Überschriftszeilen, darunter die
 * Antworten spaltenweise. Hier liest der Brief (lib/brief.ts) und der
 * Fragen-Vorschlag (lib/form-questions.ts) dieselben Abschnitte – ohne Modell,
 * damit beide dasselbe sehen und der Prompt nur den relevanten Teil bekommt.
 */

/** Minimaler CSV-Leser: Anführungszeichen, doppelte Anführungszeichen, Zeilenumbrüche in Zellen. */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") rows[rows.length - 1].push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      rows[rows.length - 1].push(cell);
      cell = "";
      rows.push([]);
    } else cell += c;
  }
  rows[rows.length - 1].push(cell);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

/**
 * Die Tabelle ist ein Raster aus schwarzen Überschriftszeilen und den
 * Antworten darunter, spaltenweise. Eine Überschrift ist eine Frage („…?“)
 * ohne Aufzählungsstrich; eine Überschriftszeile besteht nur aus solchen
 * (oder hat mindestens zwei). Ein Abschnitt ist alles unter seiner
 * Überschrift, in ihrer Spaltenbreite (bis zur nächsten Überschrift derselben
 * Zeile), bis zur nächsten Überschriftszeile.
 */
const isHeading = (cell: string) => /\?\s*$/.test(cell) && !/^[-–•*]/.test(cell);
const isHeadingRow = (row: string[]) => {
  const filled = row.filter(Boolean);
  const headings = filled.filter(isHeading).length;
  return headings > 0 && (headings >= 2 || headings === filled.length);
};

export function sheetSection(grid: string[][], heading: RegExp): string {
  for (let r = 0; r < grid.length; r++) {
    if (!isHeadingRow(grid[r])) continue;
    const c = grid[r].findIndex((cell) => isHeading(cell) && heading.test(cell));
    if (c < 0) continue;
    let end = grid[r].findIndex((cell, k) => k > c && Boolean(cell));
    if (end < 0) end = Number.MAX_SAFE_INTEGER;
    const lines: string[] = [];
    for (let k = r + 1; k < grid.length && !isHeadingRow(grid[k]) && lines.length < 60; k++)
      for (const cell of grid[k].slice(c, end)) if (cell) lines.push(cell);
    return lines.join("\n").trim();
  }
  return "";
}

export type SheetSections = {
  requirements: string;
  certificates: string;
  conditions: string;
  /** „Wie gestaltet sich Ihr Jobangebot?“ – Benefits, „Besteht aktuell“ und „Weitere Vorschläge“. */
  offer: string;
  /** „Wo befinden sich die Patienten?“ – Standort/Radius. */
  patients: string;
};

/** Die Abschnitte der Onboarding-Tabelle, die Brief und Formular lesen. */
export function sheetSections(csv?: string): SheetSections {
  if (!csv?.trim()) return { requirements: "", certificates: "", conditions: "", offer: "", patients: "" };
  const grid = parseCsv(csv);
  return {
    requirements: sheetSection(grid, /vor+aus+etzung/i),
    certificates: sheetSection(grid, /zertifikat|f[üu]hrerschein|sonstige/i),
    conditions: sheetSection(grid, /arbeitsbedingung/i),
    offer: sheetSection(grid, /jobangebot/i),
    patients: sheetSection(grid, /patienten/i),
  };
}

/** Ein Ort im Text, an den eine Bedingung gebunden ist: „Führerschein für Bad Sulza“ → „Bad Sulza“. */
export function placeQualifier(line: string): string | undefined {
  const m = /\b[fF][üu]r\s+(?:\d{5}\s+)?([A-ZÄÖÜ][\wäöüß.-]+(?:\s+[A-ZÄÖÜ][\wäöüß.-]+)*)/.exec(line);
  return m?.[1];
}

/** „31.08.26“ / „1.9.2026“ → Date; alles andere undefined. */
export function parseGermanDate(text: string): Date | undefined {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(text);
  if (!m) return undefined;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Älter als ein Jahr – so lange gilt eine Notiz im Onboarding als aktuell. */
export const STALE_AFTER_DAYS = 365;
export function isStale(dateText: string | undefined, now = new Date()): boolean {
  const d = dateText ? parseGermanDate(dateText) : undefined;
  if (!d) return false;
  return (now.getTime() - d.getTime()) / 86_400_000 > STALE_AFTER_DAYS;
}


