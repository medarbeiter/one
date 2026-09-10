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

/** Der Führerschein kommt nur ins Formular, wenn Aufgabe oder Onboarding ihn nennen – im Onboarding zählt nur der Block der Voraussetzungen. */
export function licenseRequired(input: QuestionsInput): boolean {
  return LICENSE.test([input.notes, input.instructions, requirementsBlock(input.onboardingCsv)].filter(Boolean).join("\n"));
}

/** Aus der Onboarding-Tabelle nur den Block „Welche fachlichen Voraussetzungen muss der Kandidat erfüllen?“ – bis zur nächsten Frage-Überschrift. */
export function requirementsBlock(csv?: string): string {
  if (!csv) return "";
  const lines = csv.split("\n");
  const start = lines.findIndex((l) => /voraussetzung/i.test(l));
  if (start < 0) return "";
  const out = [lines[start]];
  for (const l of lines.slice(start + 1)) {
    if (/^"?[^",]*\?/.test(l) && out.length > 1) break; // die nächste Frage der Tabelle
    out.push(l);
    if (out.length > 40) break;
  }
  return out.join("\n").trim();
}

export function questionsPrompt(input: QuestionsInput): string {
  const roles = roleLabels(input.roles, input.roleFreeText).join(", ") || "Pflegekräfte";
  const req = requirementsBlock(input.onboardingCsv);
  const fixed = [
    input.roles.includes("PFK") ? "„Hast du eine abgeschlossene 3-jährige Ausbildung in der Pflege?“ (Ja/Nein)" : "",
    roleChoiceQuestion(input.roles, input.roleFreeText) ? "„Für welche Stelle interessierst du dich?“" : "",
    "die Führerschein-Frage (kommt automatisch, falls verlangt)",
    "„Wann bist du am besten erreichbar?“ und die Kontaktfelder",
  ].filter(Boolean);
  return `Du entwirfst die Qualifizierungsfragen für ein Meta-Lead-Formular einer Pflege-Stellenanzeige (Bewerbung per Handy, Du-Ansprache). Das Formular ist ein Filter: zu viel Reibung kostet Bewerber, zu wenig lässt jeden durch. Finde die Balance – frag nur, was für diesen Kunden wirklich entscheidet.

GESUCHTE STELLEN: ${roles}

AUFGABE (Beschreibung und Hinweise der Agentur):
${[input.notes, input.instructions].filter((t) => t?.trim()).join("\n\n") || "–"}

FACHLICHE VORAUSSETZUNGEN AUS DER ONBOARDING-TABELLE DES KUNDEN (maßgeblich – hier steht, wen er wirklich nimmt):
${req || "–"}

BENEFITS (nur Kontext, daraus entstehen keine Fragen):
${input.benefits?.trim() || "–"}

FERTIGE BAUSTEINE (Wortlaut der Agentur – passt einer, nimm ihn per {"brick":"id"} statt ihn umzuschreiben; Ton und Länge sind auch das Maß für eigene Fragen):
${bricksForPrompt()}

REGELN:
- 1 bis 3 Multiple-Choice-Fragen. Jede Frage muss sich aus den Stellen, der Aufgabe oder den Voraussetzungen begründen – keine allgemeinen Fragen.
- Ausbildungen immer mit ihrer Dauer nennen: 3-jährige Ausbildung zur Pflegefachkraft, 1-jährige Ausbildung zur Pflegehilfskraft, LG1-Schein. Nie nur „Ja, als Fachkraft“.
- Verlangt der Kunde etwas ausdrücklich (bestimmte Ausbildung, Schichten, Wochenende, Nachtdienst, Erfahrung, Sprache), frag genau danach und gib den Antworten, die ihn nicht erfüllen, das Ziel "nolead". Wünsche ohne Muss werden gefragt, aber nicht ausgeschlossen.
- "goto" nennt je Antwort das Ziel; fehlt eine Antwort, geht es zur nächsten Frage. Ziele: "nolead" (Kein Lead), "lead" (Formular sofort senden), oder eine Zahl = Nummer einer späteren Frage in deiner Liste (Sprung, z. B. Fachkraft überspringt die Hilfskraft-Frage).
- Antworten kurz (höchstens 6 Wörter), 2 bis 4 je Frage, ohne Erklärsätze.
- Nicht fragen (kommt fest dazu oder ist tabu): ${fixed.join("; ")}. Kein Gehalt, Alter, Herkunft, Gesundheit, Familie.
- Keine Frage nach Ausbildung, wenn ausdrücklich Quereinsteiger ohne Ausbildung gesucht sind.

Antworte NUR mit JSON, ohne Erklärung:
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
