import { expect, test } from "bun:test";
import { mistral, parseBody, parseTitles, roleLabels } from "./bodies";

test("parseTitles liest die Liste, wirft zu Lange weg und kappt bei fünf", () => {
  expect(parseTitles('{"titel": ["Kurz", "  Pflege-Jobs (m/w/d)  "]}')).toEqual([
    "Kurz",
    "Pflege-Jobs (m/w/d)",
  ]);
  // 41–60 Zeichen füllen nur Restplätze (kurze zuerst), über 60 fliegt raus.
  const longish = "x".repeat(45);
  expect(parseTitles(JSON.stringify({ titel: [longish, "Ok"] }))).toEqual(["Ok", longish]);
  expect(() => parseTitles(JSON.stringify({ titel: ["x".repeat(61)] }))).toThrow("zu lang");
  const seven = Array.from({ length: 12 }, (_, i) => `Titel ${i}`);
  expect(parseTitles(JSON.stringify({ titel: seven }))).toHaveLength(5);
  expect(parseTitles('{"titel": ["Gleich", "gleich", "Anders"]}')).toEqual(["Gleich", "Anders"]);
  expect(() => parseTitles("kein json")).toThrow("kein lesbares JSON");
  expect(() => parseTitles('{"titel": []}')).toThrow("keine Überschriftenliste");
});

test("parseBody nimmt reinen Text und streift Zaun und Anführungszeichen ab", () => {
  expect(parseBody("Du bist Pflegefachkraft?\n\nDann komm zu uns.")).toBe(
    "Du bist Pflegefachkraft?\n\nDann komm zu uns.",
  );
  expect(parseBody('```\n"Komm zu uns."\n```')).toBe("Komm zu uns.");
  expect(parseBody("„Komm zu uns.“")).toBe("Komm zu uns.");
  expect(() => parseBody("```\n```")).toThrow("keinen Text");
});

test("roleLabels übersetzt Kürzel und hängt den Freitext an", () => {
  expect(roleLabels(["PFK", "PDL"], " Koch ")).toEqual([
    "Pflegefachkraft",
    "Pflegedienstleitung",
    "Koch",
  ]);
  expect(roleLabels(["unbekannt"], "")).toEqual([]);
});

test("mistral(): höchstens sechs gleichzeitig, mindestens 100 ms zwischen zwei Starts", async () => {
  process.env.MISTRAL_API_KEY = "test";
  const starts: number[] = [];
  let inflight = 0;
  let maxInflight = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    starts.push(Date.now());
    inflight++;
    maxInflight = Math.max(maxInflight, inflight);
    await new Promise((r) => setTimeout(r, 200));
    inflight--;
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const out = await Promise.all(Array.from({ length: 12 }, () => mistral("p")));
    expect(out).toEqual(Array(12).fill("ok"));
    expect(maxInflight).toBeLessThanOrEqual(6);
    starts.sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(90);
  } finally {
    globalThis.fetch = realFetch;
  }
});
