/**
 * Die Vorlage für ein Lead-Formular, so wie die Erweiterung (extension/) sie im
 * Baukasten abtippt. Rein: keine Netzanbindung, damit die festen Regeln der
 * Agentur hier prüfbar stehen und nicht in einer Server Action verschwinden.
 *
 * Warum kein Graph-Aufruf: per API entstehen nur sofort aktive Formulare ohne
 * bedingte Logik und ohne zweite Zielseite (Spec 2026-08-16 §8). Beides gibt
 * es nur im Baukasten – also bedient die Erweiterung den Baukasten.
 */
import { ROLES } from "./naming";

export type FormQuestion = {
  label: string;
  /** Antwortmöglichkeiten, in Reihenfolge. */
  options: string[];
  /** Antworten, die auf die Nicht-Lead-Zielseite führen (bedingte Logik). */
  disqualify: string[];
};

export type FormEnding = { title: string; description: string; buttonLabel: string; url: string };

export type FormSpec = {
  name: string;
  language: "Deutsch";
  sharing: "Offen";
  intro: { title: string; description: string };
  questions: FormQuestion[];
  /** Freitextfragen nach den Multiple-Choice-Fragen; die Erreichbarkeit steht immer zuletzt. */
  freeText: string[];
  contact: { headline: string; fields: ["FULL_NAME", "PHONE", "EMAIL"] };
  privacyUrl: string;
  /** „Datenschutzrichtlinie von {Kunde} ansehen“ – Meta erlaubt 70 Zeichen. */
  privacyLinkText: string;
  website: string;
  endings: { lead: FormEnding; nonLead: FormEnding };
};

export type FormSpecInput = {
  /** Der beworbene Kunde – steht im Datenschutz-Linktext. */
  business: string;
  roles: string[];
  roleFreeText?: string;
  version: number;
  initials: string;
  city: string;
  questions: FormQuestion[];
  privacyUrl: string;
  website: string;
};

export const REACHABILITY = "Wann bist du am besten erreichbar?";
export const CONTACT_HEADLINE = "Wie können wir dich am besten erreichen?";
export const INTRO_TEXT =
  "Beantworte uns dazu ein paar Fragen und sag uns, wie wir dich am besten erreichen können.";
export const introTitle = (city: string) => `Bewirb dich bei uns in ${city.trim()} 🫶🏻`;

const LEAD_TITLE = "Du erhältst zu deiner Bewerbung einen Anruf von uns!";
const LEAD_TEXT =
  "Wir werden dich zum gewünschten Zeitpunkt anrufen, damit wir über deine Bewerbung sprechen können.\n\n" +
  "Wir freuen uns auf dich!\n\n" +
  "Schau dich gern mal auf unserer Website um:";
const NON_LEAD_TITLE = "Danke für dein Interesse!";
const NON_LEAD_TEXT =
  "Basierend auf deinen Antworten ist dies vielleicht nicht die beste Option für dich. " +
  "Sieh dir auf unserer Website an, was wir sonst noch anbieten.";
const BUTTON = "Website ansehen";
const LINK_TEXT_LIMIT = 70;

export function privacyLinkText(business: string): string {
  const full = `Datenschutzrichtlinie von ${business.trim()} ansehen`;
  return business.trim() && full.length <= LINK_TEXT_LIMIT ? full : "Datenschutzrichtlinie ansehen";
}

/**
 * Was an Fragen fest ist – wenig, mit Absicht. Alles Weitere entsteht je Kunde
 * aus Aufgabe und Onboarding-Tabelle (lib/form-questions.ts); die fünf
 * Referenzformulare der Agentur zeigen nur Ton und Form.
 */

/** Immer bei Pflegefachkräften: die 3-jährige Ausbildung, „Nein“ ist kein Lead. */
export const PFK_QUESTION: FormQuestion = {
  label: "Hast du eine abgeschlossene 3-jährige Ausbildung in der Pflege?",
  options: ["Ja", "Nein"],
  disqualify: ["Nein"],
};

/** Nur, wenn Aufgabe oder Onboarding den Führerschein verlangen. */
export const LICENSE_QUESTION: FormQuestion = {
  label: "Hast du einen Führerschein?",
  options: ["Ja", "Nein"],
  disqualify: ["Nein"],
};

/** Pflege und Leitung sind verschiedene Berufe – sucht ein Kunde beides, fragt das Formular zuerst, wohin. */
const MANAGEMENT = new Set(["PDL", "Stv. PDL"]);
const CARE = new Set(["FK", "HK", "PFK", "PA", "PH", "QE", "BK"]);

export function roleChoiceQuestion(roles: string[], roleFreeText?: string): FormQuestion | undefined {
  const codes = roles.filter((r) => r.trim());
  const labels = codes.map((code) => ROLES.find((r) => r.code === code)?.label ?? code);
  const free = roleFreeText?.trim();
  if (free) labels.push(free);
  const management = codes.some((c) => MANAGEMENT.has(c));
  const care = codes.some((c) => CARE.has(c));
  if (!(management && care) || labels.length < 2) return undefined;
  return { label: "Für welche Stelle interessierst du dich?", options: [...new Set(labels)], disqualify: [] };
}

/** `PFK/PA v1 JP` – Kürzel, wo eins existiert, sonst die Bezeichnung wörtlich. */
export function formName(roles: string[], roleFreeText: string | undefined, version: number, initials: string): string {
  const parts = roles.filter((r) => r.trim()).map((code) => ROLES.find((r) => r.code === code)?.code ?? code);
  const free = roleFreeText?.trim();
  if (free) parts.push(free);
  return [parts.join("/") || "Formular", `v${Math.max(1, version)}`, initials.trim()].filter(Boolean).join(" ");
}

/**
 * Die nächste freie Version zu einem Präfix: „PFK v1 JP“, „PFK v2 JP“ liegen
 * schon da → 3. Groß-/Kleinschreibung und Abstände zählen nicht.
 */
export function nextVersion(existingNames: string[], roles: string[], roleFreeText: string | undefined, initials: string): number {
  const prefix = formName(roles, roleFreeText, 1, initials).replace(/ v1( |$)/, " v");
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  let max = 0;
  for (const name of existingNames) {
    const n = norm(name);
    const p = norm(prefix);
    // Präfix bis vor die Version, dann die Zahl, dann derselbe Rest (Initialen).
    const [head, tail = ""] = p.split(" v");
    const m = n.match(new RegExp(`^${escape(head)} v(\\d+)\\s*${escape(tail)}$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

const clean = (q: FormQuestion): FormQuestion | undefined => {
  const label = q.label.trim();
  const options = q.options.map((o) => o.trim()).filter(Boolean);
  if (!label || options.length < 2) return undefined;
  const disqualify = q.disqualify.map((o) => o.trim()).filter((o) => options.includes(o));
  return { label, options, disqualify };
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Fragen zusammensetzen: Stellenwahl (falls Pflege und Leitung gemischt),
 * die PFK-Frage, dann die Vorschläge der KI, zuletzt der Führerschein – nur
 * wenn verlangt. Doppelte Beschriftungen und KI-Fassungen der festen Fragen
 * fallen weg.
 */
export function assembleQuestions(input: {
  roles: string[];
  roleFreeText?: string;
  suggested: FormQuestion[];
  licenseRequired: boolean;
}): FormQuestion[] {
  const fixed: FormQuestion[] = [];
  const choice = roleChoiceQuestion(input.roles, input.roleFreeText);
  if (choice) fixed.push(choice);
  if (input.roles.includes("PFK")) fixed.push(PFK_QUESTION);
  const suggested = input.suggested.filter(
    (q) =>
      !/f[üu]hrerschein|fahrerlaubnis/i.test(q.label) &&
      !(fixed.includes(PFK_QUESTION) && /3.?j[äa]hrig|dreij[äa]hrig|pflegefachkraft|examin/i.test(q.label) && q.options.length <= 2),
  );
  const out: FormQuestion[] = [];
  for (const raw of [...fixed, ...suggested, ...(input.licenseRequired ? [LICENSE_QUESTION] : [])]) {
    const q = clean(raw);
    if (q && !out.some((x) => same(x.label, q.label))) out.push(q);
  }
  return out;
}

export function buildFormSpec(input: FormSpecInput): FormSpec {
  const website = input.website.trim();
  const ending = (title: string, description: string): FormEnding => ({
    title,
    description,
    buttonLabel: BUTTON,
    url: website,
  });
  return {
    name: formName(input.roles, input.roleFreeText, input.version, input.initials),
    language: "Deutsch",
    sharing: "Offen",
    intro: { title: introTitle(input.city), description: INTRO_TEXT },
    questions: input.questions.map(clean).filter((q): q is FormQuestion => !!q),
    freeText: [REACHABILITY],
    contact: { headline: CONTACT_HEADLINE, fields: ["FULL_NAME", "PHONE", "EMAIL"] },
    privacyUrl: input.privacyUrl.trim() || website,
    privacyLinkText: privacyLinkText(input.business),
    website,
    endings: {
      lead: ending(LEAD_TITLE, LEAD_TEXT),
      nonLead: ending(NON_LEAD_TITLE, NON_LEAD_TEXT),
    },
  };
}

/** Was noch fehlt, bevor die Erweiterung losläuft – dieselbe Form wie adSetBlockers. */
export function formSpecBlockers(spec: FormSpec): string[] {
  return [
    ...(spec.website ? [] : ["Es fehlt die Website des Kunden."]),
    ...(spec.questions.length ? [] : ["Es fehlt mindestens eine Frage zur Qualifikation."]),
    ...(spec.intro.title === introTitle("") ? ["Es fehlt der Ort."] : []),
  ];
}

/**
 * Eine Zeile je Frage: `Hast du einen Führerschein? | Ja, Nein*` – das
 * Sternchen markiert Antworten, die zur Nicht-Lead-Seite führen. Kompakt genug
 * für ein Textfeld, statt eines Editors mit Zeilen und Knöpfen je Option.
 */
export function parseQuestionLines(text: string): FormQuestion[] {
  return text
    .split("\n")
    .map((line) => {
      const [label = "", rest = ""] = line.split("|");
      const opts = rest.split(",").map((o) => o.trim()).filter(Boolean);
      return {
        label: label.trim(),
        options: opts.map((o) => o.replace(/\*$/, "").trim()),
        disqualify: opts.filter((o) => o.endsWith("*")).map((o) => o.replace(/\*$/, "").trim()),
      };
    })
    .map(clean)
    .filter((q): q is FormQuestion => !!q);
}

export function questionLines(questions: FormQuestion[]): string {
  return questions
    .map((q) => `${q.label} | ${q.options.map((o) => (q.disqualify.includes(o) ? `${o}*` : o)).join(", ")}`)
    .join("\n");
}

/** Für den Hash in der Baukasten-URL – base64url, damit nichts escaped werden muss. */
export function encodeSpec(spec: FormSpec): string {
  const bytes = new TextEncoder().encode(JSON.stringify(spec));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
