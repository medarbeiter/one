import { expect, test } from "bun:test";
import { BODY_TEMPLATE_COUNT, generateBody, generateDescription, generateTitles, mistral, parseBody, parseTitles, roleLabels } from "./bodies";

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
    "Pflegefachkräfte",
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

test("Hinweise erreichen Primärtext, Überschriften und Beschreibung – als derselbe Block", async () => {
  process.env.MISTRAL_API_KEY = "test";
  const sent: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    sent.push(String(init?.body));
    // Als Text wie als Titelliste lesbar – parseBody und parseTitles nehmen beides.
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"titel": ["Ok"]}' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const input = { business: "MeVita", roles: ["PFK"], benefits: "Jobrad", instructions: "Keine Emojis. Ton sachlich." };
    await generateBody(input, 0);
    await generateTitles(input);
    await generateDescription(input);
    expect(sent).toHaveLength(3);
    expect(sent.every((r) => r.includes("ZUSÄTZLICHE KAMPAGNENHINWEISE") && r.includes("Keine Emojis"))).toBe(true);
    // Ohne Hinweise kein Block – der Prompt bleibt, wie er war.
    sent.length = 0;
    await generateDescription({ business: "MeVita", roles: ["PFK"], benefits: "Jobrad" });
    expect(sent[0]).not.toContain("ZUSÄTZLICHE KAMPAGNENHINWEISE");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("alle Textvorlagen verlangen natürliche Namen, nur den Ort und fünf starke Benefits", async () => {
  const realFetch = globalThis.fetch;
  const key = process.env.MISTRAL_API_KEY;
  process.env.MISTRAL_API_KEY = "test";
  const sent: string[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)).messages[0].content);
    return Response.json({ choices: [{ message: { content: '{"titel":["Pflege-Job"]}' } }] });
  }) as typeof fetch;
  try {
    const input = {
      business: "Seniorenstift am Obermain STE GmbH", roles: ["PFK"],
      place: "Musterstraße 12, 96231 Bad Staffelstein",
      benefits: "Nettes Team\nJobRad\n33 Urlaubstage\nWeihnachtsgeld\nPlanbare Dienste\nBezahlte Weiterbildung",
    };
    for (let i = 0; i < BODY_TEMPLATE_COUNT; i++) await generateBody(input, i);
    await generateDescription(input);
    await generateTitles(input);
    for (const prompt of sent) {
      expect(prompt).toContain("Seniorenstift am Obermain“");
      expect(prompt).toContain("Artikel, Pronomen und Präpositionen");
      expect(prompt).toContain("keine Straße, Hausnummer oder PLZ");
    }
    for (const prompt of sent.slice(0, -1)) {
      expect(prompt).toContain("Die Eingabe enthält 6 Benefits");
      expect(prompt).toContain("Schreibe 5 Benefit-Zeilen");
      expect(prompt).toContain("PFLICHT");
      expect(prompt).toContain("genau fünf unterschiedliche Benefits");
      expect(prompt).toContain("weniger als fünf");
      expect(prompt).toContain("Und mehr...");
      expect(prompt).not.toContain("3–5");
      expect(prompt).not.toContain("weniger ist besser");
      expect(prompt).not.toContain("keinen Benefit weglassen");
    }
    await generateDescription({ ...input, benefits: "JobRad\n33 Urlaubstage\njobrad\n" });
    expect(sent.at(-1)).toContain("Schreibe 2 Benefit-Zeilen");
    expect(sent.at(-1)).toContain("Keine Schlusszeile");
    await generateDescription({ ...input, benefits: "" });
    expect(sent.at(-1)).toContain("Schreibe 0 Benefit-Zeilen");
  } finally {
    globalThis.fetch = realFetch;
    if (key === undefined) delete process.env.MISTRAL_API_KEY;
    else process.env.MISTRAL_API_KEY = key;
  }
});
