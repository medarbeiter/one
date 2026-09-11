/**
 * Mistral schlägt die Qualifizierungsfragen vor – die sind je Stelle
 * verschieden und stehen nirgends als Regel. Was fest ist (PFK-Ausbildung,
 * Führerschein, Erreichbarkeit, Kontakt), setzt lib/form-spec.ts danach
 * deterministisch davor bzw. dahinter. Läuft nur auf dem Server.
 */
import { mistral, roleLabels } from "./bodies";
import { brick, bricksForPrompt } from "./form-bricks";
import { assembleQuestions, roleChoiceQuestion, type FormQuestion, type Goto } from "./form-spec";

export type QuestionsInput = {
  roles: string[];
  roleFreeText?: string;
  /** Benefits und Anforderungen des Kunden – dort steht, ob ein Führerschein Pflicht ist. */
  benefits?: string;
  /** Aufgabenbeschreibung und Hinweise – dieselbe Quelle wie für die Texte. */
  notes?: string;
  instructions?: string;
  /** Der CSV-Export der Onboarding-Tabelle – dort stehen die fachlichen Voraussetzungen. */
  onboardingCsv?: string;
};

const LICENSE = /f[üu]hrerschein|fahrerlaubnis|pkw|klasse b/i;

/**
 * Der Führerschein kommt nur ins Formular, wenn Aufgabe oder Onboarding ihn
 * nennen – im Onboarding zählen die Voraussetzungen und die Spalte
 * „Sonstiges/Zertifikate“ (deren Überschrift selbst „Führerschein“ sagt,
 * darum nur der Inhalt darunter).
 */
export function licenseRequired(input: QuestionsInput): boolean {
  const sheet = sheetSections(input.onboardingCsv);
  return LICENSE.test([input.notes, input.instructions, sheet.requirements, sheet.certificates].filter(Boolean).join("\n"));
}

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

export type SheetSections = { requirements: string; certificates: string; conditions: string };

/** Die drei Abschnitte der Onboarding-Tabelle, aus denen Qualifizierungsfragen entstehen dürfen. */
export function sheetSections(csv?: string): SheetSections {
  if (!csv?.trim()) return { requirements: "", certificates: "", conditions: "" };
  const grid = parseCsv(csv);
  return {
    requirements: sheetSection(grid, /vor+aus+etzung/i),
    certificates: sheetSection(grid, /zertifikat|f[üu]hrerschein|sonstige/i),
    conditions: sheetSection(grid, /arbeitsbedingung/i),
  };
}

/** Aus der Onboarding-Tabelle nur den Block „Welche fachlichen Voraussetzungen muss der Kandidat erfüllen?“. */
export const requirementsBlock = (csv?: string): string => sheetSections(csv).requirements;

export function questionsPrompt(input: QuestionsInput): string {
  const roles = roleLabels(input.roles, input.roleFreeText).join(", ") || "Pflegekräfte";
  const sheet = sheetSections(input.onboardingCsv);
  const fixed = [
    input.roles.includes("PFK") ? "„Hast du eine abgeschlossene 3-jährige Ausbildung in der Pflege?“ (Ja/Nein)" : "",
    roleChoiceQuestion(input.roles, input.roleFreeText) ? "„Für welche Stelle interessierst du dich?“" : "",
    "die Führerschein-Frage (kommt automatisch, falls verlangt)",
    "„Wann bist du am besten erreichbar?“ und die Kontaktfelder",
  ].filter(Boolean);
  return `Du entwirfst die Qualifizierungsfragen für ein Meta-Lead-Formular einer Pflege-Stellenanzeige (Bewerbung per Handy, Du-Ansprache). Das Formular ist ein Filter: Es soll die aussortieren, die der Kunde sicher nicht nimmt – und sonst niemanden aufhalten. Jede Frage kostet Bewerber. Eine Frage lohnt sich nur, wenn ein nennenswerter Teil der Bewerber an ihr scheitern würde UND der Kunde genau diese Bewerber nicht will.

GESUCHTE STELLEN: ${roles}

AUFGABE (Beschreibung und Hinweise der Agentur – hat Vorrang vor der Tabelle):
${[input.notes, input.instructions].filter((t) => t?.trim()).join("\n\n") || "–"}

ONBOARDING-TABELLE DES KUNDEN – „Welche fachlichen Voraussetzungen muss der Kandidat erfüllen?“ (maßgeblich – hier steht, wen er wirklich nimmt; oft nach Ort und mit Datum gegliedert, dann zählt der Eintrag zu den gesuchten Stellen):
${sheet.requirements || "–"}

ONBOARDING-TABELLE – „Sonstiges / Zertifikate wie z. B. Führerschein?“:
${sheet.certificates || "–"}

ONBOARDING-TABELLE – „Wie gestalten sich die Arbeitsbedingungen?“ (Frage-Antwort-Paare; eine leere „Antwort:“ heißt: keine Angabe, also keine Frage daraus):
${sheet.conditions || "–"}

BENEFITS (nur Kontext, daraus entstehen keine Fragen):
${input.benefits?.trim() || "–"}

FERTIGE BAUSTEINE (Wortlaut der Agentur – passt einer, nimm ihn per {"brick":"id"} statt ihn umzuschreiben; Ton und Länge sind auch das Maß für eigene Fragen):
${bricksForPrompt()}

REGELN:
- 0 bis 3 Multiple-Choice-Fragen. Jede Frage muss sich aus den Stellen, der Aufgabe oder der Tabelle belegen lassen – nenne dir vor jeder Frage den Satz aus den Quellen, der sie verlangt. Gibt es keinen, gibt es die Frage nicht. Eine leere Liste ist eine gute Antwort, wenn die festen Fragen schon alles Entscheidende abdecken.
- Schichten, Wochenende, Früh-/Spätdienst sind in der Pflege normal – fast jeder Bewerber sagt Ja, die Frage filtert nichts und kostet nur. Danach fragen NUR, wenn der Kunde etwas Unübliches ausdrücklich als Bedingung nennt (Nachtdienst Pflicht, 12h-Dienste, 24h-Betreuung, jedes Wochenende, geteilte Dienste). „Früh- und Spätdienst“ allein ist nie ein Grund.
- Was tatsächlich aussortiert: fehlende Ausbildung oder Schein, fehlende Erfahrung, wo der Kunde sie verlangt, ausdrücklich verlangte Zusatzqualifikationen (Beatmungsschein, Intensiv, LG1, Praxisanleiter-Weiterbildung), Deutsch, wenn der Kunde es nennt, Führerschein (kommt fest dazu), ein verlangtes Arbeitszeitmodell (Vollzeit-Pflicht, nur Minijob).
- Ausbildungen immer mit ihrer Dauer nennen: 3-jährige Ausbildung zur Pflegefachkraft, 1-jährige Ausbildung zur Pflegehilfskraft, LG1-Schein. Nie nur „Ja, als Fachkraft“.
- Verlangt der Kunde etwas ausdrücklich als Muss, gib den Antworten, die es nicht erfüllen, das Ziel "nolead". Wünsche ohne Muss („gern“, „wäre schön“, „bevorzugt“) werden nicht gefragt.
- "goto" nennt je Antwort das Ziel; fehlt eine Antwort, geht es zur nächsten Frage. Ziele: "nolead" (Kein Lead), "lead" (Formular sofort senden), oder eine Zahl = Nummer einer späteren Frage in deiner Liste (Sprung, z. B. Fachkraft überspringt die Hilfskraft-Frage).
- Antworten kurz (höchstens 6 Wörter), 2 bis 4 je Frage, ohne Erklärsätze.
- Nicht fragen (kommt fest dazu oder ist tabu): ${fixed.join("; ")}. Kein Gehalt, Alter, Herkunft, Gesundheit, Familie.
- Keine Frage nach Ausbildung, wenn ausdrücklich Quereinsteiger ohne Ausbildung gesucht sind.

Antworte NUR mit JSON, ohne Erklärung – auch [] ist eine Antwort:
[{"brick":"id"},{"label":"…","options":["…","…"],"goto":{"…":"nolead"}}]`;
}

const unfence = (s: string) => s.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();

/** Defensiv wie parseCampaignContext in lib/brief.ts: alles Fremde fällt heraus. Bausteine per id, Ziele nur die vier bekannten. */
export function parseQuestions(content: string): FormQuestion[] {
  let data: unknown;
  try {
    data = JSON.parse(unfence(content));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const goto = (v: unknown): Record<string, Goto> => {
    const out: Record<string, Goto> = {};
    if (!v || typeof v !== "object" || Array.isArray(v)) return out;
    for (const [o, g] of Object.entries(v as Record<string, unknown>)) {
      if (g === "lead" || g === "nolead" || (typeof g === "number" && Number.isInteger(g) && g > 0)) out[o.trim()] = g;
    }
    return out;
  };
  return data
    .map((q): FormQuestion => {
      const b = brick(str((q as { brick?: unknown })?.brick));
      if (b) return { ...b.question, goto: { ...b.question.goto } };
      const options = list((q as { options?: unknown })?.options);
      return {
        label: str((q as { label?: unknown })?.label),
        options,
        // Altes Feld der KI-Antwort – wer es noch schreibt, meint "nolead".
        goto: { ...Object.fromEntries(list((q as { disqualify?: unknown })?.disqualify).map((o) => [o, "nolead" as const])), ...goto((q as { goto?: unknown })?.goto) },
      };
    })
    .filter((q) => q.label && q.options.length >= 2)
    .slice(0, 4);
}

export async function suggestQuestions(input: QuestionsInput): Promise<FormQuestion[]> {
  let suggested: FormQuestion[] = [];
  try {
    suggested = parseQuestions(await mistral(questionsPrompt(input), { temperature: 0.2 }));
  } catch (e) {
    // Ohne Vorschlag bleiben die festen Fragen – die Vorlage ist trotzdem brauchbar.
    console.warn("Fragenvorschlag fehlgeschlagen:", (e as Error).message);
  }
  return assembleQuestions({ roles: input.roles, roleFreeText: input.roleFreeText, suggested, licenseRequired: licenseRequired(input) });
}
