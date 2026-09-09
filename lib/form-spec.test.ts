/**
 * bun test – die festen Regeln der Agentur für ein Lead-Formular. Sie stehen
 * hier, damit sie sich nicht unbemerkt verschieben: die Erweiterung tippt
 * blind ab, was die Vorlage sagt.
 */
import { expect, test } from "bun:test";
import {
  assembleQuestions,
  buildFormSpec,
  formName,
  formSpecBlockers,
  LICENSE_QUESTION,
  nextVersion,
  PFK_QUESTION,
  questionBlockers,
  privacyLinkText,
  REACHABILITY,
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
    { label: "Hast du eine abgeschlossene Pflegefachkraft-Ausbildung?", options: ["Ja", "Nein"], disqualify: ["Nein"] },
    { label: "Hast du einen Führerschein?", options: ["Ja", "Nein"], disqualify: ["Nein"] },
    { label: "Bist du bereit, im Nachtdienst zu arbeiten?", options: ["Ja", "Nein"], disqualify: ["Nein"] },
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
    disqualify: [],
  });
  expect(roleChoiceQuestion(["PFK", "PHK"])).toBeUndefined();
  expect(roleChoiceQuestion(["PDL"], "Praxisanleiter")).toBeUndefined();
  expect(assembleQuestions({ roles: ["PFK", "Stv. PDL"], suggested: [], licenseRequired: false })[0].label).toBe("Für welche Stelle interessierst du dich?");
});

test("Ausschlüsse müssen eine der Antworten sein", () => {
  const [q] = buildFormSpec({
    ...base,
    questions: [{ label: "Schicht?", options: ["Früh", "Spät"], disqualify: ["Nacht", "Spät"] }],
  }).questions;
  expect(q.disqualify).toEqual(["Spät"]);
});

test("Blocker nennen Website, Fragen und Ort", () => {
  expect(formSpecBlockers(buildFormSpec({ ...base, website: "", questions: [], city: "" }))).toHaveLength(3);
  expect(formSpecBlockers(buildFormSpec(base))).toEqual([]);
});

test("Blocker je Frage: Text, zwei Antworten, keine Doppelten, nicht jeden aussortieren, Logik irgendwo", () => {
  expect(questionBlockers([{ label: "", options: ["Ja"], disqualify: [] }])).toEqual([
    "F1: Es fehlt der Fragetext.",
    "F1: Mindestens zwei Antworten.",
    "Keine Antwort führt zur Nicht-Lead-Seite – mindestens eine Frage braucht bedingte Logik.",
  ]);
  expect(questionBlockers([{ label: "Schicht?", options: ["Früh", "früh "], disqualify: ["Früh"] }])).toEqual([
    "F1: Eine Antwort steht doppelt.",
  ]);
  expect(questionBlockers([{ label: "Schicht?", options: ["Früh", "Spät"], disqualify: ["Früh", "Spät"] }])).toEqual([
    "F1: Jede Antwort führt zur Nicht-Lead-Seite – niemand käme durch.",
  ]);
  expect(questionBlockers([PFK_QUESTION, { label: "Schicht?", options: ["Früh", "Spät"], disqualify: [] }])).toEqual([]);
});

test("der Datenschutz-Linktext nennt den Kunden, solange er ins Limit passt", () => {
  expect(buildFormSpec(base).privacyLinkText).toBe("Datenschutzrichtlinie von VitalCura ansehen");
  expect(privacyLinkText("Pflegedienst mit einem viel zu langen Namen für Metas Linktext GmbH & Co. KG")).toBe("Datenschutzrichtlinie ansehen");
  expect(privacyLinkText("")).toBe("Datenschutzrichtlinie ansehen");
});
