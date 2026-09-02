import { expect, test } from "bun:test";
import {
  overviewFacts,
  parseEuro,
  parseRoles,
  rolesFromTaskName,
  taskIdFromInput,
  toBrief,
  type RawTask,
} from "./clickup";

test("taskIdFromInput liest die nackte ID und beide Link-Formen", () => {
  expect(taskIdFromInput("86cbd7afg")).toBe("86cbd7afg");
  expect(taskIdFromInput("https://app.clickup.com/t/86cbd7afg")).toBe("86cbd7afg");
  expect(taskIdFromInput("https://app.clickup.com/t/9011138519/86cbd7afg")).toBe("86cbd7afg");
});

test("taskIdFromInput: ein Kundenname oder Leeres ist keine ID", () => {
  expect(taskIdFromInput("MeVita Pflegedienst GmbH")).toBeUndefined();
  expect(taskIdFromInput("")).toBeUndefined();
});

test("parseEuro liest Zahlen, Texte mit Euro-Zeichen und deutsche Schreibweisen", () => {
  expect(parseEuro(17.05)).toBe(17.05);
  expect(parseEuro("17.05")).toBe(17.05);
  expect(parseEuro("2435€")).toBe(2435);
  expect(parseEuro("2.435 €")).toBe(2435);
  expect(parseEuro("2435,50€")).toBe(2435.5);
});

test("parseEuro gibt bei Müll und Null nichts zurück", () => {
  expect(parseEuro(null)).toBeUndefined();
  expect(parseEuro("")).toBeUndefined();
  expect(parseEuro("nein")).toBeUndefined();
  expect(parseEuro("0")).toBeUndefined();
});

test("parseRoles erkennt Kürzel, auch gemischt geschrieben und mit Trennzeichen", () => {
  expect(parseRoles("FK")).toEqual({ roles: ["FK"], free: "" });
  expect(parseRoles("PFK/PDL")).toEqual({ roles: ["PFK", "PDL"], free: "" });
  expect(parseRoles("fk, hk und stv. pdl")).toEqual({ roles: ["FK", "HK", "Stv. PDL"], free: "" });
});

test("parseRoles: kein Kürzel heißt keine Rolle – „s. OB“ ist eine Notiz, kein Freitext", () => {
  expect(parseRoles("s. OB")).toEqual({ roles: [], free: "" });
});

test("parseRoles: Unbekanntes neben einem Kürzel wird Freitext", () => {
  expect(parseRoles("FK Verwaltungskraft")).toEqual({ roles: ["FK"], free: "Verwaltungskraft" });
});

test("rolesFromTaskName liest die Rollen zwischen „ - “ und „ ab “ – und lässt den Ort weg", () => {
  expect(rolesFromTaskName("MeVita Pflegedienst GmbH - PFK Renningen ab x.9.26 KF (via One)")).toEqual(["PFK"]);
  expect(rolesFromTaskName("Aktiv Dahoam sPDL Kampagne ab 29.07 MH")).toEqual([]);
  expect(rolesFromTaskName("X - FK/HK ab 03.01.26 KF (via One)")).toEqual(["FK", "HK"]);
});

// Gekürzt aus der echten Aufgabe 86cbd7afg (Probe vom 2026-09-02).
const mevita: RawTask = {
  id: "86cbd7afg",
  name: "MeVita Pflegedienst GmbH - PFK Renningen ab x.9.26 KF (via One)",
  status: { status: "kampagne anlegen" },
  date_created: "1756800000000",
  markdown_description: "neu anlegen, infos fast identisch zu letzter\nFK für Renningen",
  folder: { id: "901511138445", name: " MeVita Pflegedienst GmbH" },
  assignees: [{ username: "Felix Kinze", email: "f.kinze@med-arbeiter.de" }],
  custom_fields: [
    { name: "Tagesbudget", type: "currency", value: "17.05" },
    { name: "Ausgabenlimit", type: "short_text", value: null },
    { name: "Drive-Link", type: "url", value: null },
    { name: "gesuchte Stellen", type: "short_text", value: "FK" },
    { name: "Kanal ", type: "drop_down", value: null },
  ],
};

test("toBrief bildet die Aufgabe ab: Ordnername getrimmt, Felder geparst, Leeres weggelassen", () => {
  expect(toBrief(mevita)).toEqual({
    taskId: "86cbd7afg",
    name: "MeVita Pflegedienst GmbH - PFK Renningen ab x.9.26 KF (via One)",
    customer: "MeVita Pflegedienst GmbH",
    folderId: "901511138445",
    assignees: ["f.kinze@med-arbeiter.de"],
    description: "neu anlegen, infos fast identisch zu letzter\nFK für Renningen",
    dailyBudgetEuros: 17.05,
    spendCapEuros: undefined,
    rolesText: "FK",
    driveUrl: undefined,
    createdAt: 1756800000000,
  });
});

test("overviewFacts liest Adresse und offene Stellen aus der Kundenübersicht", () => {
  const md = "Ansprechpartner: Frau Muster\nAdresse: Am Illgenberg 2, 76530 Baden-Baden\nOffene Stellen: PDL\n";
  expect(overviewFacts(md)).toEqual({ address: "Am Illgenberg 2, 76530 Baden-Baden", rolesText: "PDL" });
});

test("overviewFacts: nur die Adresse steht drin", () => {
  const md = "Adresse: Musterstr. 1, 12345 Musterstadt\n";
  expect(overviewFacts(md)).toEqual({ address: "Musterstr. 1, 12345 Musterstadt", rolesText: undefined });
});

test("overviewFacts: keine der beiden Zeilen vorhanden", () => {
  expect(overviewFacts("Passwort: geheim\nTelefon: 0123456\n")).toEqual({
    address: undefined,
    rolesText: undefined,
  });
});

test("overviewFacts: eine Zeile nur mit Leerzeichen zählt als leer", () => {
  const md = "Adresse:    \nOffene Stellen: FK\n";
  expect(overviewFacts(md)).toEqual({ address: undefined, rolesText: "FK" });
});

test("overviewFacts: Markdown-Fettung um den Wert wird abgestreift", () => {
  const md = "Adresse: **Am Illgenberg 2, 76530 Baden-Baden**\n";
  expect(overviewFacts(md)).toEqual({ address: "Am Illgenberg 2, 76530 Baden-Baden", rolesText: undefined });
});

test("toBrief liest das Ausgabenlimit als Text mit Euro-Zeichen", () => {
  const raw: RawTask = {
    ...mevita,
    custom_fields: [{ name: "Ausgabenlimit", type: "short_text", value: "2435€" }],
  };
  expect(toBrief(raw).spendCapEuros).toBe(2435);
  expect(toBrief(raw).dailyBudgetEuros).toBeUndefined();
});
