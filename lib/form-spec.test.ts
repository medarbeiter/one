/**
 * bun test – die festen Regeln der Agentur für ein Lead-Formular. Sie stehen
 * hier, damit sie sich nicht unbemerkt verschieben: die Erweiterung tippt
 * blind ab, was die Vorlage sagt.
 */
import { expect, test } from "bun:test";
import {
  assembleQuestions,
  type FormQuestion,
  buildFormSpec,
  formName,
  formSpecBlockers,
  LICENSE_QUESTION,
  moveQuestion,
  nextVersion,
  PFK_QUESTION,
  questionBlockers,
  privacyLinkText,
  REACHABILITY,
  removeQuestion,
  roleChoiceQuestion,
} from "./form-spec";

const base = {
  business: "VitalCura",
  roles: ["PFK"],
  version: 1,
  initials: "JP",
  city: "Hennef",
  questions: [PFK_QUESTION],
  privacyUrl: "https://vitalcura.de/datenschutz/",
  website: "https://vitalcura.de/",
};

test("der Name ist Kürzel/Kürzel Version Initialen", () => {
  expect(formName(["PFK", "PA"], undefined, 1, "JP")).toBe("PFK/PA v1 JP");
  expect(formName(["PFK"], "Praxisanleiter", 2, "JP")).toBe("PFK/Praxisanleiter v2 JP");
});

test("die nächste Version zählt nur gleichnamige Formulare", () => {
  const names = ["PFK v1 JP", "pfk  v3 jp", "PFK v9 AB", "PFK/PA v4 JP"];
  expect(nextVersion(names, ["PFK"], undefined, "JP")).toBe(4);
  expect(nextVersion(names, ["PDL"], undefined, "JP")).toBe(1);
});

test("Sprache, Freigabe, Intro und Enden stehen fest", () => {
  const s = buildFormSpec(base);
  expect(s.language).toBe("Deutsch");
  expect(s.sharing).toBe("Offen");
  expect(s.intro.title).toBe("Bewirb dich bei uns in Hennef 🫶🏻");
  expect(s.contact.fields).toEqual(["FULL_NAME", "PHONE", "EMAIL"]);
  expect(s.freeText).toEqual([REACHABILITY]);
  expect(s.endings.lead.title).toBe("Du erhältst zu deiner Bewerbung einen Anruf von unserem Team.");
  expect(s.endings.nonLead.title).toBe("Danke für dein Interesse!");
  expect(s.endings.lead.buttonLabel).toBe("Website ansehen");
  expect(s.endings.nonLead.url).toBe("https://vitalcura.de/");
});

test("ohne Datenschutz-URL zählt die Website", () => {
  expect(buildFormSpec({ ...base, privacyUrl: " " }).privacyUrl).toBe("https://vitalcura.de/");
});

test("fest sind nur PFK-Frage, Stellenwahl und – auf Verlangen – der Führerschein", () => {
  const suggested = [
    { label: "Hast du eine abgeschlossene Pflegefachkraft-Ausbildung?", options: ["Ja", "Nein"], goto: { Nein: "nolead" as const } },
    { label: "Hast du einen Führerschein?", options: ["Ja", "Nein"], goto: { Nein: "nolead" as const } },
    { label: "Bist du bereit, im Nachtdienst zu arbeiten?", options: ["Ja", "Nein"], goto: { Nein: "nolead" as const } },
  ];
  const pfk = assembleQuestions({ roles: ["PFK"], suggested, licenseRequired: false });
  expect(pfk.map((q) => q.label)).toEqual([PFK_QUESTION.label, "Bist du bereit, im Nachtdienst zu arbeiten?"]);
  const withLicense = assembleQuestions({ roles: ["HK"], suggested, licenseRequired: true });
  expect(withLicense.map((q) => q.label)).toEqual([
    "Hast du eine abgeschlossene Pflegefachkraft-Ausbildung?",
    "Bist du bereit, im Nachtdienst zu arbeiten?",
    LICENSE_QUESTION.label,
  ]);
});

test("Pflege und Leitung gemischt fragt zuerst nach der Stelle", () => {
  expect(roleChoiceQuestion(["PFK", "PDL"])).toEqual({
    label: "Für welche Stelle interessierst du dich?",
    options: ["Pflegefachkräfte", "Pflegedienstleitung"],
    goto: {},
  });
  expect(roleChoiceQuestion(["PFK", "PHK"])).toBeUndefined();
  expect(roleChoiceQuestion(["PDL"], "Praxisanleiter")).toBeUndefined();
  expect(assembleQuestions({ roles: ["PFK", "Stv. PDL"], suggested: [], licenseRequired: false })[0].label).toBe("Für welche Stelle interessierst du dich?");
});

test("Ziele müssen zu einer Antwort gehören und eins der vier Ziele sein", () => {
  const [q] = buildFormSpec({
    ...base,
    questions: [{ label: "Schicht?", options: ["Früh", "Spät", "Nacht"], goto: { Tag: "nolead", Spät: "nolead", Früh: "next", Nacht: 0 } }],
  }).questions;
  expect(q.goto).toEqual({ Spät: "nolead" });
});

test("Sprünge der KI zählen ihre eigene Liste – nach dem Zusammensetzen stimmen die Nummern", () => {
  const suggested: FormQuestion[] = [
    { label: "Ausbildung?", options: ["Fachkraft", "Hilfskraft", "Keine"], goto: { Fachkraft: 3, Keine: "nolead" } },
    { label: "LG1?", options: ["Ja", "Nein"], goto: {} },
    { label: "Nachtdienst?", options: ["Ja", "Nein"], goto: { Nein: "nolead" } },
  ];
  const qs = assembleQuestions({ roles: ["PFK"], suggested, licenseRequired: false });
  expect(qs.map((q) => q.label)).toEqual([PFK_QUESTION.label, "Ausbildung?", "LG1?", "Nachtdienst?"]);
  expect(qs[1].goto).toEqual({ Fachkraft: 4, Keine: "nolead" });
  // Ziel fällt weg (hier: Dublette der festen Frage) → weiter zur nächsten.
  const dropped = assembleQuestions({
    roles: ["PFK"],
    suggested: [{ label: "A?", options: ["x", "y"], goto: { x: 2 } }, { label: PFK_QUESTION.label, options: ["Ja", "Nein"], goto: {} }],
    licenseRequired: false,
  });
  expect(dropped[1].goto).toEqual({});
});

test("Verschieben und Löschen nehmen die Sprünge mit", () => {
  const qs: FormQuestion[] = [
    { label: "A", options: ["1", "2"], goto: { "1": 3 } },
    { label: "B", options: ["1", "2"], goto: { "2": "nolead" } },
    { label: "C", options: ["1", "2"], goto: {} },
  ];
  expect(moveQuestion(qs, 1, 1).map((q) => [q.label, q.goto])).toEqual([["A", { "1": 2 }], ["C", {}], ["B", { "2": "nolead" }]]);
  expect(removeQuestion(qs, 2).map((q) => q.goto)).toEqual([{}, { "2": "nolead" }]);
  expect(removeQuestion(qs, 1).map((q) => q.goto)).toEqual([{ "1": 2 }, {}]);
});

test("Blocker nennen Website, Fragen und Ort", () => {
  expect(formSpecBlockers(buildFormSpec({ ...base, website: "", questions: [], city: "" }))).toHaveLength(3);
  expect(formSpecBlockers(buildFormSpec(base))).toEqual([]);
});

test("Drag-and-drop über mehrere Positionen erhält explizite Ziele und Grenzen", () => {
  const qs: FormQuestion[] = [
    { label: "A", options: ["Ja", "Nein"], goto: { Ja: 3, Nein: "nolead" } },
    { label: "B", options: ["Ja", "Nein"], goto: {} },
    { label: "C", options: ["Ja", "Nein"], goto: {} },
    { label: "D", options: ["Ja", "Nein"], goto: {} },
  ];
  const moved = moveQuestion(qs, 3, -2);
  expect(moved.map(q => q.label)).toEqual(["A", "D", "B", "C"]);
  expect(moved[0].goto).toEqual({ Ja: 4, Nein: "nolead" });
  expect(moveQuestion(moved, 1, 2)).toEqual(qs);
  expect(moveQuestion(qs, -1, 1)).toBe(qs);
  expect(qs[0].goto.Ja).toBe(3);
});

test("unerreichbare Fragen können keine weiteren Fragen erreichbar machen", () => {
  const q: FormQuestion = { label: "Frage", options: ["Ja", "Nein"], goto: {} };
  expect(questionBlockers([{ ...q, goto: { Ja: "lead", Nein: "nolead" } }, q, q])).toEqual([
    "F2: Keine Antwort führt hierher.", "F3: Keine Antwort führt hierher.",
  ]);
});

test("Blocker je Frage: Text, zwei Antworten, keine Doppelten, nicht jeden aussortieren, Logik irgendwo", () => {
  expect(questionBlockers([{ label: "", options: ["Ja"], goto: {} }])).toEqual([
    "F1: Es fehlt der Fragetext.",
    "F1: Mindestens zwei Antworten.",
    "Keine Antwort führt zur Nicht-Lead-Seite – mindestens eine Frage braucht bedingte Logik.",
  ]);
  expect(questionBlockers([{ label: "Schicht?", options: ["Früh", "früh "], goto: { Früh: "nolead" } }])).toEqual([
    "F1: Eine Antwort steht doppelt.",
  ]);
  expect(questionBlockers([{ label: "Schicht?", options: ["Früh", "Spät"], goto: { Früh: "nolead", Spät: "nolead" } }])).toEqual([
    "F1: Jede Antwort führt zur Nicht-Lead-Seite – niemand käme durch.",
  ]);
  expect(questionBlockers([PFK_QUESTION, { label: "Schicht?", options: ["Früh", "Spät"], goto: {} }])).toEqual([]);
});

test("Blocker für Sprünge: nur vorwärts, und jede Frage muss erreichbar sein", () => {
  const b = { label: "B", options: ["1", "2"], goto: {} };
  expect(questionBlockers([{ label: "A", options: ["1", "2"], goto: { "1": 1, "2": 9 } }, b])).toEqual([
    "F1: „1“ verweist auf F1 – nur auf eine spätere Frage.",
    "F1: „2“ verweist auf F9 – nur auf eine spätere Frage.",
    "F2: Keine Antwort führt hierher.",
    "Keine Antwort führt zur Nicht-Lead-Seite – mindestens eine Frage braucht bedingte Logik.",
  ]);
  expect(questionBlockers([{ label: "A", options: ["1", "2"], goto: { "1": 3, "2": "nolead" } }, b, { ...b, label: "C" }])).toEqual([
    "F2: Keine Antwort führt hierher.",
  ]);
  expect(questionBlockers([{ label: "A", options: ["1", "2", "3"], goto: { "1": 3, "2": "nolead" } }, { ...b, goto: { "1": "lead" } }, { ...b, label: "C" }])).toEqual([]);
});

test("der Datenschutz-Linktext nennt den Kunden, solange er ins Limit passt", () => {
  expect(buildFormSpec(base).privacyLinkText).toBe("Datenschutzrichtlinie von VitalCura ansehen");
  expect(privacyLinkText("Pflegedienst mit einem viel zu langen Namen für Metas Linktext GmbH & Co. KG")).toBe("Datenschutzrichtlinie ansehen");
  expect(privacyLinkText("")).toBe("Datenschutzrichtlinie ansehen");
});
