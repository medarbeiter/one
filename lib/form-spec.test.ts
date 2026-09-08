/**
 * bun test – die festen Regeln der Agentur für ein Lead-Formular. Sie stehen
 * hier, damit sie sich nicht unbemerkt verschieben: die Erweiterung tippt
 * blind ab, was die Vorlage sagt.
 */
import { expect, test } from "bun:test";
import {
  assembleQuestions,
  buildFormSpec,
  encodeSpec,
  formName,
  formSpecBlockers,
  LICENSE_QUESTION,
  nextVersion,
  parseQuestionLines,
  PFK_QUESTION,
  privacyLinkText,
  questionLines,
  REACHABILITY,
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
  expect(s.endings.lead.title).toBe("Du erhältst zu deiner Bewerbung einen Anruf von uns!");
  expect(s.endings.nonLead.title).toBe("Danke für dein Interesse!");
  expect(s.endings.lead.buttonLabel).toBe("Website ansehen");
  expect(s.endings.nonLead.url).toBe("https://vitalcura.de/");
});

test("ohne Datenschutz-URL zählt die Website", () => {
  expect(buildFormSpec({ ...base, privacyUrl: " " }).privacyUrl).toBe("https://vitalcura.de/");
});

test("PFK bekommt immer die Ausbildungsfrage zuerst, Führerschein nur auf Verlangen", () => {
  const suggested = [
    { label: "Hast du einen Abschluss als Pflegefachkraft?", options: ["Ja", "Nein"], disqualify: ["Nein"] },
    { label: "Arbeitest du auch im Nachtdienst?", options: ["Ja", "Nein"], disqualify: [] },
  ];
  const qs = assembleQuestions({ roles: ["PFK"], suggested, licenseRequired: true });
  expect(qs.map((q) => q.label)).toEqual([PFK_QUESTION.label, LICENSE_QUESTION.label, "Arbeitest du auch im Nachtdienst?"]);
  expect(assembleQuestions({ roles: ["QE"], suggested: [], licenseRequired: false })).toEqual([]);
});

test("Ausschlüsse müssen eine der Antworten sein", () => {
  const [q] = buildFormSpec({
    ...base,
    questions: [{ label: "Schicht?", options: ["Früh", "Spät"], disqualify: ["Nacht", "Spät"] }],
  }).questions;
  expect(q.disqualify).toEqual(["Spät"]);
});

test("Zeilen und Fragen gehen verlustfrei hin und her", () => {
  const text = "Hast du einen Führerschein? | Ja, Nein*\nSchicht? | Früh, Spät, Nacht*";
  const qs = parseQuestionLines(text);
  expect(qs[0]).toEqual(LICENSE_QUESTION);
  expect(qs[1].disqualify).toEqual(["Nacht"]);
  expect(questionLines(qs)).toBe(text);
  expect(parseQuestionLines("nur Text ohne Optionen\n\n")).toEqual([]);
});

test("Blocker nennen Website, Fragen und Ort", () => {
  expect(formSpecBlockers(buildFormSpec({ ...base, website: "", questions: [], city: "" }))).toHaveLength(3);
  expect(formSpecBlockers(buildFormSpec(base))).toEqual([]);
});

test("der Hash ist base64url und trägt Umlaute", () => {
  const enc = encodeSpec(buildFormSpec(base));
  expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
  const json = new TextDecoder().decode(Uint8Array.from(atob(enc.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
  expect(JSON.parse(json).intro.title).toContain("🫶🏻");
});

test("der Datenschutz-Linktext nennt den Kunden, solange er ins Limit passt", () => {
  expect(buildFormSpec(base).privacyLinkText).toBe("Datenschutzrichtlinie von VitalCura ansehen");
  expect(privacyLinkText("Pflegedienst mit einem viel zu langen Namen für Metas Linktext GmbH & Co. KG")).toBe("Datenschutzrichtlinie ansehen");
  expect(privacyLinkText("")).toBe("Datenschutzrichtlinie ansehen");
});
