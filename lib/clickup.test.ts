import { expect, test } from "bun:test";
import { parseEuro, parseRoles, rolesFromTaskName, toBrief, type RawTask } from "./clickup";

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
  folder: { name: " MeVita Pflegedienst GmbH" },
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
    assignees: ["f.kinze@med-arbeiter.de"],
    description: "neu anlegen, infos fast identisch zu letzter\nFK für Renningen",
    dailyBudgetEuros: 17.05,
    spendCapEuros: undefined,
    rolesText: "FK",
    driveUrl: undefined,
    createdAt: 1756800000000,
  });
});

test("toBrief liest das Ausgabenlimit als Text mit Euro-Zeichen", () => {
  const raw: RawTask = {
    ...mevita,
    custom_fields: [{ name: "Ausgabenlimit", type: "short_text", value: "2435€" }],
  };
  expect(toBrief(raw).spendCapEuros).toBe(2435);
  expect(toBrief(raw).dailyBudgetEuros).toBeUndefined();
});
