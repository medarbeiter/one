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

/**
 * Wohin eine Antwort führt – genau die vier Ziele, die Metas Baukasten kennt:
 * "next" die folgende Frage (Standard, steht deshalb nicht im JSON),
 * eine Zahl = eine spätere Frage (F-Nummer, 1-basiert),
 * "lead" = Formular senden (Zielseite E1), "nolead" = Formular schließen (E2).
 */
export type Goto = "next" | "lead" | "nolead" | number;

export type FormQuestion = {
  label: string;
  /** Antwortmöglichkeiten, in Reihenfolge. */
  options: string[];
  /** Ziel je Antwort (Schlüssel = Antworttext). Fehlt eine Antwort, heißt das "next". */
  goto: Record<string, Goto>;
};

export const gotoOf = (q: FormQuestion, option: string): Goto => q.goto[option] ?? "next";

/** Ziele auf eine Fragenummer umschreiben – nach Verschieben oder Löschen einer Frage. */
export function renumber(questions: FormQuestion[], map: (n: number) => Goto): FormQuestion[] {
  return questions.map((q) => ({
    ...q,
    goto: Object.fromEntries(Object.entries(q.goto).map(([o, g]) => [o, typeof g === "number" ? map(g) : g]).filter(([, g]) => g !== "next")),
  }));
}

/** Frage i eine Stelle nach oben (-1) oder unten (+1); Verweise wandern mit. */
export function moveQuestion(questions: FormQuestion[], i: number, dir: -1 | 1): FormQuestion[] {
  const j = i + dir;
  if (j < 0 || j >= questions.length) return questions;
  const next = [...questions];
  [next[i], next[j]] = [next[j], next[i]];
  return renumber(next, (n) => (n === i + 1 ? j + 1 : n === j + 1 ? i + 1 : n));
}

/** Frage i entfernen; Verweise darauf werden "next", spätere rücken auf. */
export function removeQuestion(questions: FormQuestion[], i: number): FormQuestion[] {
  return renumber(
    questions.filter((_, k) => k !== i),
    (n) => (n === i + 1 ? "next" : n > i + 1 ? n - 1 : n),
  );
}

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

const LEAD_TITLE = "Du erhältst zu deiner Bewerbung einen Anruf von unserem Team.";
const LEAD_TEXT =
  "Vielen Dank für deine Bewerbung!\n\n" +
  "Wir werden dich zum gewünschten Zeitpunkt anrufen, damit wir über deine Bewerbung sprechen können.\n\n" +
  "Wir freuen uns auf dich!\n\n" +
  "Bitte stelle sicher, dass du telefonisch erreichbar bist.";
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
  goto: { Nein: "nolead" },
};

/** Nur, wenn Aufgabe oder Onboarding den Führerschein verlangen. */
export const LICENSE_QUESTION: FormQuestion = {
  label: "Hast du einen Führerschein?",
  options: ["Ja", "Nein"],
  goto: { Nein: "nolead" },
};

/** Pflege und Leitung sind verschiedene Berufe – sucht ein Kunde beides, fragt das Formular zuerst, wohin. */
const MANAGEMENT = new Set(["PDL", "Stv. PDL"]);
const CARE = new Set(["PFK", "PHK", "MA", "BK"]);

export function roleChoiceQuestion(roles: string[], roleFreeText?: string): FormQuestion | undefined {
  const codes = roles.filter((r) => r.trim());
  const labels = codes.map((code) => ROLES.find((r) => r.code === code)?.label ?? code);
  const free = roleFreeText?.trim();
  if (free) labels.push(free);
  const management = codes.some((c) => MANAGEMENT.has(c));
  const care = codes.some((c) => CARE.has(c));
  if (!(management && care) || labels.length < 2) return undefined;
  return { label: "Für welche Stelle interessierst du dich?", options: [...new Set(labels)], goto: {} };
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
  const goto: Record<string, Goto> = {};
  for (const [o, g] of Object.entries(q.goto ?? {})) {
    const key = o.trim();
    if (options.includes(key) && g !== "next" && (g === "lead" || g === "nolead" || (Number.isInteger(g) && (g as number) > 0))) goto[key] = g;
  }
  return { label, options, goto };
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
  const raws: FormQuestion[] = [];
  for (const raw of [...fixed, ...suggested, ...(input.licenseRequired ? [LICENSE_QUESTION] : [])]) {
    const q = clean(raw);
    if (q && !out.some((x) => same(x.label, q.label))) {
      out.push(q);
      raws.push(raw);
    }
  }
  // Zahlen in den KI-Vorschlägen zählen die Vorschlagsliste – hier stehen
  // feste Fragen davor und manche Vorschläge fallen weg, also neu zählen.
  return out.map((q, i) => {
    if (!input.suggested.includes(raws[i])) return q;
    return renumber([q], (n) => {
      const target = raws.indexOf(input.suggested[n - 1]) + 1;
      return target > i + 1 ? target : "next";
    })[0];
  });
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

/**
 * Was noch fehlt, bevor die Erweiterung losläuft – dieselbe Form wie
 * adSetBlockers. Geprüft werden die Fragen, wie sie im Editor stehen (roh),
 * nicht die bereinigten: eine Frage mit einer Antwort fällt bei clean() still
 * weg, hier soll sie beim Namen genannt werden.
 */
export function formSpecBlockers(spec: FormSpec): string[] {
  return [
    ...(spec.website ? [] : ["Es fehlt die Website des Kunden."]),
    ...(spec.questions.length ? questionBlockers(spec.questions) : ["Es fehlt mindestens eine Frage zur Qualifikation."]),
    ...(spec.intro.title === introTitle("") ? ["Es fehlt der Ort."] : []),
  ];
}

/**
 * Die bedingte Logik ist der Zweck des Formulars: mindestens eine Antwort muss
 * auf die Nicht-Lead-Seite führen, keine Frage darf jeden aussortieren, Sprünge
 * gehen nur vorwärts, und jede Frage muss von irgendeiner Antwort erreicht werden.
 */
export function questionBlockers(questions: FormQuestion[]): string[] {
  const out: string[] = [];
  const reached = new Set<number>([1]);
  questions.forEach((q, i) => {
    const n = `F${i + 1}`;
    const opts = q.options.map((o) => o.trim()).filter(Boolean);
    if (!q.label.trim()) out.push(`${n}: Es fehlt der Fragetext.`);
    if (opts.length < 2) out.push(`${n}: Mindestens zwei Antworten.`);
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) out.push(`${n}: Eine Antwort steht doppelt.`);
    if (opts.length && opts.every((o) => gotoOf(q, o) === "nolead")) out.push(`${n}: Jede Antwort führt zur Nicht-Lead-Seite – niemand käme durch.`);
    for (const o of opts) {
      const g = gotoOf(q, o);
      if (g === "next") reached.add(i + 2);
      else if (typeof g === "number") {
        if (g <= i + 1 || g > questions.length) out.push(`${n}: „${o}“ verweist auf F${g} – nur auf eine spätere Frage.`);
        else reached.add(g);
      }
    }
  });
  questions.forEach((_, i) => {
    if (i > 0 && !reached.has(i + 1)) out.push(`F${i + 1}: Keine Antwort führt hierher.`);
  });
  if (questions.length && !questions.some((q) => q.options.some((o) => gotoOf(q, o) === "nolead")))
    out.push("Keine Antwort führt zur Nicht-Lead-Seite – mindestens eine Frage braucht bedingte Logik.");
  return out;
}
