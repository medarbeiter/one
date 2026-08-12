/**
 * Geldrechnung: Ergebnisse und Kosten pro Ergebnis. Meta liefert je Objective
 * andere action_types, deshalb eine feste Rangfolge statt "das erste".
 */
import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";
const { results, costPerResult } = await import("./campaigns");

const a = (action_type: string, value: string) => ({ action_type, value });

test("Leads schlagen Klicks, Klicks schlagen Interaktionen", () => {
  expect(results({ actions: [a("post_engagement", "90"), a("lead", "3")] })).toBe(3);
  expect(results({ actions: [a("post_engagement", "90"), a("link_click", "12")] })).toBe(12);
  expect(results({ actions: [a("post_engagement", "90")] })).toBe(90);
});

test("Ohne Actions gibt es kein Ergebnis – nicht null", () => {
  expect(results(undefined)).toBeUndefined();
  expect(results({ actions: [] })).toBeUndefined();
  expect(results({ actions: [a("video_view", "5")] })).toBeUndefined();
});

test("Kosten pro Ergebnis, ohne Division durch null", () => {
  expect(costPerResult({ spend: "30.00", actions: [a("lead", "3")] })).toBe(10);
  expect(costPerResult({ spend: "30.00", actions: [a("lead", "0")] })).toBeUndefined();
  expect(costPerResult({ spend: "30.00" })).toBeUndefined();
  expect(costPerResult({ actions: [a("lead", "3")] })).toBeUndefined();
});
