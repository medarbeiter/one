import { expect, test } from "bun:test";
import { assembleBrief, parseCampaignContext, parseLocationHint, parseOnboarding, type BriefDeps } from "./brief";
import { overviewFacts, type Brief } from "./clickup";

test("parseLocationHint nimmt Adresse, Ort und Formular-Hinweis aus dem JSON", () => {
  expect(
    parseLocationHint('{"adresse":"Mühlgasse 24+26, 71272 Renningen","ort":"Renningen","formular":"Renningen"}'),
  ).toEqual({ locations: ["Mühlgasse 24+26, 71272 Renningen"], formHint: "Renningen", titles: [] });
});

test("parseLocationHint verträgt Markdown-Zaun und null-Werte", () => {
  expect(parseLocationHint('```json\n{"adresse":null,"ort":null,"formular":null}\n```')).toEqual({ locations: [], titles: [] });
});

test("parseLocationHint nimmt mehrere Standorte, ohne Doppelte", () => {
  expect(
    parseLocationHint('{"standorte":["Renningen","Stuttgart","renningen"],"formular":null}'),
  ).toEqual({ locations: ["Renningen", "Stuttgart"], titles: [] });
});

test("parseLocationHint liest einen genannten Umkreis, aber keinen erfundenen", () => {
  expect(parseLocationHint('{"standorte":["Renningen"],"formular":null,"umkreis_km":30}').radiusKm).toBe(30);
  expect(parseLocationHint('{"standorte":["Renningen"],"formular":null,"umkreis_km":"25"}').radiusKm).toBe(25);
  expect(parseLocationHint('{"standorte":[],"formular":null,"umkreis_km":null}').radiusKm).toBeUndefined();
  expect(parseLocationHint('{"standorte":[],"formular":null,"umkreis_km":0}').radiusKm).toBeUndefined();
});

test("parseLocationHint wirft bei Unlesbarem", () => {
  expect(() => parseLocationHint("keine Ahnung")).toThrow();
});

test("parseOnboarding liefert Benefits als Zeilen; Stellen als Kürzel, Unbekanntes als Freitext", () => {
  expect(
    parseOnboarding('{"benefits":["jedes 2. Wochenende bleibt frei","33 Urlaubstage"],"rollen":["FK","XYZ","pdl"]}'),
  ).toEqual({
    benefits: ["jedes 2. Wochenende bleibt frei", "33 Urlaubstage"],
    roles: ["PFK", "PDL"],
    roleFreeText: "XYZ",
    perLocation: [],
  });
  // Die Tabelle aus der Probe vom 2026-09-04: PA, FK, Praxisanleiter.
  expect(parseOnboarding('{"benefits":[],"stellen":["PA","FK","Praxisanleiter","Pflegefachkraft"]}')).toEqual({
    benefits: [],
    roles: ["PHK", "PFK"],
    roleFreeText: "Praxisanleiter",
    perLocation: [],
  });
});

test("parseOnboarding: leere oder fehlende Listen sind leer, kein Fehler", () => {
  expect(parseOnboarding("{}")).toEqual({ benefits: [], roles: [], roleFreeText: "", perLocation: [] });
});

test("parseOnboarding liest Standort der Patienten, Umkreis und Stellen je Ort mit Datum", () => {
  // Die Tabelle aus der Probe vom 2026-09-11: fünf „Für <Ort>:“-Blöcke, Patienten in Bad Sulza.
  const out = parseOnboarding(
    '{"benefits":[],"stellen":["HK","PFK"],"standort":"Bad Sulza","umkreis_km":"30","je_standort":[{"ort":"39218 Schönebeck","datum":"31.08.26","stellen":["HK","PFK"]},{"ort":"Bad Sulza","datum":null,"stellen":["FK"]},{"ort":"","stellen":[]}]}',
  );
  expect(out.location).toBe("Bad Sulza");
  expect(out.radiusKm).toBe(30);
  expect(out.perLocation).toEqual([
    { place: "39218 Schönebeck", date: "31.08.26", jobs: ["HK", "PFK"] },
    { place: "Bad Sulza", jobs: ["FK"] },
  ]);
});

test("assembleBrief: keine Adresse in der Aufgabe → Standort der Patienten aus der Tabelle vor der Kundenübersicht", async () => {
  let overviewCalls = 0;
  const prompts: string[] = [];
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, folderId: "f1" }),
      mistral: async (c) => {
        const text = typeof c === "string" ? c : "";
        prompts.push(text);
        if (text.includes("Kampagnenkontext")) return "{}";
        if (text.includes("CSV"))
          return '{"benefits":[],"stellen":[],"standort":"Bad Sulza","umkreis_km":null,"je_standort":[{"ort":"39218 Schönebeck","datum":"31.08.26","stellen":["HK"]}]}';
        return '{"standorte":[],"formular":null}';
      },
      customerOverview: async () => {
        overviewCalls++;
        return { address: "Am Illgenberg 2, 76530 Baden-Baden" };
      },
    }),
  );
  expect(out.locations).toEqual({ value: ["Bad Sulza"], sources: ["onboarding"] });
  expect(overviewCalls).toBe(1);
  const context = prompts.find((p) => p.includes("Kampagnenkontext"))!;
  expect(context).toContain("Standort der Patienten: Bad Sulza");
  expect(context).toContain("39218 Schönebeck (31.08.26): HK");
  expect(context).toMatch(/Heute ist der \d{2}\.\d{2}\.\d{4}\./);
});

test("parseLocationHint nimmt die Stellen aus der Beschreibung mit", () => {
  expect(parseLocationHint('{"standorte":[],"formular":null,"stellen":["Praxisanleiter","PDL"]}').titles).toEqual([
    "Praxisanleiter",
    "PDL",
  ]);
});

// --- assembleBrief mit gestubbten Quellen

const brief: Brief = {
  taskId: "t1",
  name: "MeVita Pflegedienst GmbH - PFK Renningen ab x.9.26 KF (via One)",
  customer: "MeVita Pflegedienst GmbH",
  assignees: [],
  description: "Standort für Ads Gruppe: Mühlgasse 24, 71272 Renningen\nFormular: Renningen Formular auswählen",
  dailyBudgetEuros: 17.05,
  spendCapEuros: 2435,
  rolesText: "FK",
  createdAt: 1,
  updatedAt: 1,
};

const csv = [
  "Wie gestaltet sich Ihr Jobangebot?,Wie gestalten sich die Arbeitsbedingungen?",
  "Besteht aktuell:,- Früh- und Spätdienst",
  "- 33 Urlaubstage,",
  "- Jobrad,",
  "Weitere Vorschläge:,",
  "- Dienstwagen,",
].join("\n");

const deps = (over: Partial<BriefDeps> = {}): BriefDeps => ({
  getBrief: async () => brief,
  findFolders: async () => [{ id: "k", name: "MeVita", mimeType: "folder" }],
  bestLanding: async (folders) => ({ folders, landed: { path: folders, entries: [] } }),
  folderIdFromUrl: () => undefined,
  findSheet: async () => ({ id: "s", name: "Onboarding", mimeType: "sheet" }),
  exportCsv: async () => csv,
  mistral: async (content) =>
    typeof content === "string" && content.includes("Kampagnenkontext")
      ? "{}"
      : typeof content === "string" && content.includes("CSV")
        ? '{"benefits":["33 Urlaubstage","Jobrad"],"rollen":[]}'
        : '{"adresse":"Mühlgasse 24, 71272 Renningen","ort":"Renningen","formular":"Renningen"}',
  customerOverview: async () => ({}),
  ...over,
});

// keine Adresse aus der Aufgabenbeschreibung – Mistral findet dort nichts
const noAddressMistral: BriefDeps["mistral"] = async (c) =>
  typeof c === "string" && c.includes("Kampagnenkontext")
    ? "{}"
    : typeof c === "string" && c.includes("CSV")
      ? '{"benefits":[],"rollen":[]}'
      : '{"adresse":null,"ort":null,"formular":null}';

test("assembleBrief: keine Adresse in der Aufgabe → Standort aus der Kundenübersicht", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, folderId: "f1" }),
      mistral: noAddressMistral,
      customerOverview: async (folderId) => {
        expect(folderId).toBe("f1");
        return { address: "Am Illgenberg 2, 76530 Baden-Baden" };
      },
    }),
  );
  expect(out.locations).toEqual({ value: ["Am Illgenberg 2, 76530 Baden-Baden"], sources: ["clickup"] });
});

test("assembleBrief: Adresse aus der Beschreibung bleibt der feste Stand – die Kundenübersicht wird trotzdem gelesen und dem Kontext vorgelegt", async () => {
  let calls = 0;
  const prompts: string[] = [];
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, folderId: "f1" }),
      mistral: async (c, opts) => {
        prompts.push(typeof c === "string" ? c : "");
        return deps().mistral(c, opts);
      },
      customerOverview: async () => {
        calls++;
        return { address: "Firmensitz 1, 70173 Stuttgart" };
      },
    }),
  );
  expect(out.locations).toEqual({ value: ["Mühlgasse 24, 71272 Renningen"], sources: ["clickup"] });
  expect(calls).toBe(1);
  expect(prompts.find((p) => p.includes("Kampagnenkontext"))).toContain("Adresse: Firmensitz 1, 70173 Stuttgart");
});

test("Kampagnenkontext: der Prompt darf die genauere Adresse einer anderen Quelle wählen", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, folderId: "f1", description: "Standort: Renningen" }),
      mistral: routed({
        location: '{"standorte":["Renningen"],"formular":null}',
        context: '{"standorte":["Mühlgasse 24, 71272 Renningen"],"formular":"Renningen","quellen":{"standorte":["clickup","onboarding"],"formular":["clickup"]}}',
      }),
      customerOverview: async () => ({ address: "Mühlgasse 24, 71272 Renningen" }),
    }),
  );
  expect(out.locations).toEqual({ value: ["Mühlgasse 24, 71272 Renningen"], sources: ["clickup", "onboarding"] });
  expect(out.formHint).toEqual({ value: "Renningen", sources: ["clickup"] });
});

test("assembleBrief: Kundenübersicht nicht lesbar → Warnung, kein Standort", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, folderId: "f1" }),
      mistral: noAddressMistral,
      customerOverview: async () => {
        throw new Error("403");
      },
    }),
  );
  expect(out.locations).toBeUndefined();
  expect(out.warnings.join(" ")).toMatch(/Kundenübersicht/);
});

test("assembleBrief: Rollen nirgends außer in der Kundenübersicht", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({
        ...brief,
        folderId: "f1",
        rolesText: undefined,
        name: "MeVita Kampagne ab 1.9.",
      }),
      mistral: noAddressMistral,
      customerOverview: async () => ({ rolesText: "PDL" }),
    }),
  );
  expect(out.roles).toEqual({ value: ["PDL"], sources: ["clickup"] });
});

test("assembleBrief füllt alles aus ClickUp und der Onboarding-Tabelle, mit Herkunft", async () => {
  const out = await assembleBrief("t1", "", deps());
  expect(out.clientName).toEqual({ value: "MeVita Pflegedienst GmbH", sources: ["clickup"] });
  expect(out.roles).toEqual({ value: ["PFK"], sources: ["clickup"] });
  expect(out.dailyBudgetEuros).toEqual({ value: 17.05, sources: ["clickup"] });
  expect(out.spendCapEuros).toEqual({ value: 2435, sources: ["clickup"] });
  expect(out.locations).toEqual({ value: ["Mühlgasse 24, 71272 Renningen"], sources: ["clickup"] });
  expect(out.formHint).toEqual({ value: "Renningen", sources: ["clickup"] });
  expect(out.benefits).toEqual({ value: "33 Urlaubstage\nJobrad", sources: ["onboarding"] });
  expect(out.driveFolderId).toEqual({ value: "k", sources: ["clickup"] });
  expect(out.notes).toBe(brief.description);
  expect(out.warnings).toEqual([]);
});

test("assembleBrief: Rollen aus dem Aufgabennamen, wenn das Feld eine Notiz ist", async () => {
  const out = await assembleBrief("t1", "", deps({ getBrief: async () => ({ ...brief, rolesText: "s. OB" }) }));
  expect(out.roles).toEqual({ value: ["PFK"], sources: ["clickup"] });
});

test("assembleBrief: Rollen aus der Onboarding-Tabelle, wenn ClickUp keine hat", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, rolesText: undefined, name: "MeVita Kampagne ab 1.9." }),
      mistral: async (c) =>
        typeof c === "string" && c.includes("Kampagnenkontext")
          ? "{}"
          : typeof c === "string" && c.includes("CSV")
            ? '{"benefits":[],"rollen":["PFK"]}'
            : '{"adresse":null,"ort":null,"formular":null}',
    }),
  );
  expect(out.roles).toEqual({ value: ["PFK"], sources: ["onboarding"] });
  expect(out.benefits).toBeUndefined();
});

test("assembleBrief: Stellen aus der Beschreibung schlagen Aufgabenname und Tabelle", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, rolesText: "s. OB" }),
      mistral: async (c) =>
        typeof c === "string" && c.includes("Kampagnenkontext")
          ? "{}"
          : typeof c === "string" && c.includes("CSV")
            ? '{"benefits":[],"stellen":["FK","PA"]}'
            : '{"standorte":["Renningen"],"formular":null,"stellen":["Praxisanleiter","Pflegedienstleitung"]}',
    }),
  );
  expect(out.roles).toEqual({ value: ["PDL"], sources: ["clickup"] });
  expect(out.roleFreeText).toEqual({ value: "Praxisanleiter", sources: ["clickup"] });
});

test("assembleBrief: schweigt die Aufgabe, kommen die Stellen aus der Tabelle – auch als Freitext", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, name: "MeVita - Kampagne", rolesText: undefined }),
      mistral: async (c) =>
        typeof c === "string" && c.includes("Kampagnenkontext")
          ? "{}"
          : typeof c === "string" && c.includes("CSV")
            ? '{"benefits":[],"stellen":["12h-Dienste als PA","FK","Praxisanleiter"]}'
            : '{"standorte":["Renningen"],"formular":null,"stellen":[]}',
    }),
  );
  // „12h-Dienste als PA“ trägt das Kürzel im Titel – es zählt als PA, nicht als Freitext.
  expect(out.roles).toEqual({ value: ["PHK", "PFK"], sources: ["onboarding"] });
  expect(out.roleFreeText).toEqual({ value: "Praxisanleiter", sources: ["onboarding"] });
});

test("assembleBrief: nur der Ort, wenn keine Adresse genannt ist", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      mistral: async (c) =>
        typeof c === "string" && c.includes("CSV")
          ? "{}"
          : '{"adresse":null,"ort":"Renningen","formular":null}',
    }),
  );
  expect(out.locations).toEqual({ value: ["Renningen"], sources: ["clickup"] });
  expect(out.formHint).toBeUndefined();
});

test("assembleBrief: jede Quelle darf ausfallen – Feld leer, Warnung dran, kein Fehler", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      findFolders: async () => [],
      mistral: async () => {
        throw new Error("429");
      },
    }),
  );
  expect(out.benefits).toBeUndefined();
  expect(out.locations).toBeUndefined();
  expect(out.warnings).toHaveLength(2);
  expect(out.warnings.join(" ")).toMatch(/Drive-Ordner/);
  expect(out.warnings.join(" ")).toMatch(/Standort/);
});

test("assembleBrief: ein Drive-Link aus ClickUp schlägt die Ordnersuche", async () => {
  const folders: string[] = [];
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, driveUrl: "https://drive.google.com/drive/folders/LINKED" }),
      folderIdFromUrl: () => "LINKED",
      findFolders: async (n) => {
        folders.push(n);
        return [];
      },
    }),
  );
  expect(out.driveFolderId).toEqual({ value: "LINKED", sources: ["clickup"] });
  expect(folders).toEqual([]);
});

test("assembleBrief: ohne Tabelle im Ordner eine Warnung, der Ordner bleibt", async () => {
  const out = await assembleBrief("t1", "", deps({ findSheet: async () => undefined }));
  expect(out.driveFolderId?.value).toBe("k");
  expect(out.warnings.join(" ")).toMatch(/Onboarding-Tabelle/);
});

test("assembleBrief: mehrere Standorte in der Beschreibung → alle, in Reihenfolge", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      mistral: async (c) =>
        typeof c === "string" && c.includes("CSV")
          ? "{}"
          : '{"standorte":["Mühlgasse 24, 71272 Renningen","Stuttgart-Vaihingen"],"formular":"Renningen"}',
    }),
  );
  expect(out.locations?.value).toEqual(["Mühlgasse 24, 71272 Renningen", "Stuttgart-Vaihingen"]);
});

test("assembleBrief meldet jede Quelle beim Start und beim Ende, mit dem Gefundenen", async () => {
  const events: string[] = [];
  const b = await assembleBrief("t1", "", deps(), (e) => events.push(`${e.step}:${e.status}${e.detail ? ` ${e.detail}` : ""}`));
  expect(b.benefits?.value).toBeDefined();
  // Jede Quelle genau einmal „running“ und einmal abgeschlossen (done/skipped/failed).
  for (const step of ["task", "description", "drive", "onboarding", "context"] as const) {
    expect(events.filter((e) => e.startsWith(`${step}:running`))).toHaveLength(1);
    expect(events.filter((e) => e.startsWith(`${step}:done`))).toHaveLength(1);
  }
  // Ohne Kundenordner an der Aufgabe gibt es keine Kundenübersicht – aber gemeldet.
  expect(events.filter((e) => e.startsWith("overview:skipped"))).toHaveLength(1);
  expect(events.find((e) => e.startsWith("task:done"))).toContain("17,05");
  expect(events.find((e) => e.startsWith("description:done"))).toContain("Renningen");
  expect(events.find((e) => e.startsWith("onboarding:done"))).toContain("Benefits");
});

// --- Kampagnenkontext: eine Auflösung über Aufgabe, Onboarding und Hinweise

/** Ein Stub je Prompt – der Kontext-Prompt ist am Wort „Kampagnenkontext“ zu erkennen. */
const routed =
  (answers: { location?: string; onboarding?: string; context?: string | (() => string) }): BriefDeps["mistral"] =>
  async (c) => {
    const text = typeof c === "string" ? c : "";
    if (text.includes("Kampagnenkontext"))
      return typeof answers.context === "function" ? answers.context() : (answers.context ?? "{}");
    if (text.includes("CSV")) return answers.onboarding ?? '{"benefits":[],"stellen":[]}';
    return answers.location ?? '{"standorte":[],"formular":null}';
  };

test("assembleBrief lädt genau die gewählte Aufgabe – keine Geschwister", async () => {
  const taskIds: string[] = [];
  await assembleBrief(
    "selected",
    "",
    deps({
      getBrief: async (id) => {
        taskIds.push(id);
        return brief;
      },
    }),
  );
  expect(taskIds).toEqual(["selected"]);
});

test("Kampagnenkontext: Stellen aus Aufgabe und Onboarding überleben beide, mit beiden Quellen", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, rolesText: "PFK" }),
      mistral: routed({
        onboarding: '{"benefits":["Jobrad"],"stellen":["PA"]}',
        context:
          '{"stellen":["PFK","PA"],"benefits":["Jobrad"],"quellen":{"stellen":["clickup","onboarding"],"benefits":["onboarding"]}}',
      }),
    }),
  );
  expect(out.roles).toEqual({ value: ["PFK", "PHK"], sources: ["clickup", "onboarding"] });
  expect(out.benefits).toEqual({ value: "Jobrad", sources: ["onboarding"] });
});

test("Kampagnenkontext: ausdrückliche Hinweise überschreiben Rollen, Orte und Budget – und erreichen den Prompt", async () => {
  const prompts: string[] = [];
  const out = await assembleBrief(
    "t1",
    "Nur PA, Budget 40 € pro Tag, Standort Stuttgart. Ton sachlich.",
    deps({
      mistral: async (c, opts) => {
        if (typeof c === "string" && c.includes("Kampagnenkontext")) prompts.push(c);
        return routed({
          location: '{"standorte":["Renningen"],"formular":null}',
          context:
            '{"stellen":["PA"],"standorte":["Stuttgart"],"tagesbudget_eur":40,"textanweisungen":"Ton sachlich, nicht verspielt.","quellen":{"stellen":["user"],"standorte":["user"],"tagesbudget_eur":["user"],"textanweisungen":["user"]}}',
        })(c, opts);
      },
    }),
  );
  expect(out.roles).toEqual({ value: ["PHK"], sources: ["user"] });
  expect(out.locations).toEqual({ value: ["Stuttgart"], sources: ["user"] });
  expect(out.dailyBudgetEuros).toEqual({ value: 40, sources: ["user"] });
  expect(out.spendCapEuros).toEqual({ value: 2435, sources: ["clickup"] });
  expect(out.copyInstructions).toBe("Ton sachlich, nicht verspielt.");
  expect(out.aiNotes).toBe("Nur PA, Budget 40 € pro Tag, Standort Stuttgart. Ton sachlich.");
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain("Nur PA, Budget 40 € pro Tag");
});

test("Kampagnenkontext: ein Budget ohne Hinweis-Quelle bleibt das der Aufgabe", async () => {
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      mistral: routed({
        context: '{"tagesbudget_eur":99,"ausgabenlimit_eur":1,"quellen":{"tagesbudget_eur":["clickup"],"ausgabenlimit_eur":["clickup"]}}',
      }),
    }),
  );
  expect(out.dailyBudgetEuros).toEqual({ value: 17.05, sources: ["clickup"] });
  expect(out.spendCapEuros).toEqual({ value: 2435, sources: ["clickup"] });
});

test("Kampagnenkontext: leere Hinweise ändern das bisherige Ergebnis nicht", async () => {
  const withNotes = await assembleBrief("t1", "", deps());
  const without = await assembleBrief("t1", undefined, deps());
  expect(withNotes).toEqual(without);
  expect(withNotes.roles).toEqual({ value: ["PFK"], sources: ["clickup"] });
  expect(withNotes.copyInstructions).toBe("");
  expect(withNotes.aiNotes).toBe("");
});

test("Kampagnenkontext: scheitert die Auflösung, gilt die alte Rangfolge – Aufgabe vor Onboarding, mit Warnung", async () => {
  const events: string[] = [];
  const out = await assembleBrief(
    "t1",
    "Nur PA",
    deps({
      mistral: routed({
        onboarding: '{"benefits":["Jobrad"],"stellen":["PA"]}',
        context: () => {
          throw new Error("503");
        },
      }),
    }),
    (e) => events.push(`${e.step}:${e.status}`),
  );
  expect(out.roles).toEqual({ value: ["PFK"], sources: ["clickup"] });
  expect(out.benefits).toEqual({ value: "Jobrad", sources: ["onboarding"] });
  expect(out.copyInstructions).toBe("");
  expect(out.warnings.join(" ")).toMatch(/Kampagnenkontext/);
  expect(events).toContain("context:failed");
});

test("Kampagnenkontext: die Kundenübersicht erreicht Mistral nur als Fakten – nie das Doc mit Passwörtern", async () => {
  // Das Doc, wie es in ClickUp liegt: Adresse und Stellen neben Zugangsdaten.
  const doc = [
    "# Kundenübersicht",
    "Adresse: Am Illgenberg 2, 76530 Baden-Baden",
    "Offene Stellen: PDL",
    "Umkreis: 25 km",
    "Meta-Login: chef@kunde.de",
    "Passwort: GEHEIM-SENTINEL-4711",
  ].join("\n");
  const prompts: string[] = [];
  const out = await assembleBrief(
    "t1",
    "",
    deps({
      getBrief: async () => ({ ...brief, folderId: "f1", rolesText: undefined, name: "MeVita Kampagne" }),
      mistral: async (c, opts) => {
        prompts.push(typeof c === "string" ? c : JSON.stringify(c));
        return routed({ location: '{"standorte":[],"formular":null}' })(c, opts);
      },
      // Derselbe Weg wie in lib/clickup.ts: nur, was overviewFacts() herausliest.
      customerOverview: async () => overviewFacts(doc),
    }),
  );
  const context = prompts.find((p) => p.includes("Kampagnenkontext"))!;
  expect(context).toContain("Am Illgenberg 2, 76530 Baden-Baden");
  expect(context).toContain("Stellen: PDL");
  expect(context).toContain("Umkreis km: 25");
  for (const p of prompts) {
    expect(p).not.toContain("GEHEIM-SENTINEL-4711");
    expect(p).not.toContain("chef@kunde.de");
  }
  expect(out.locations).toEqual({ value: ["Am Illgenberg 2, 76530 Baden-Baden"], sources: ["clickup"] });
});

test("Kampagnenkontext: ein Hinweis darf einen Wert der Aufgabe streichen – null mit Quelle user", async () => {
  const out = await assembleBrief(
    "t1",
    "Kein Ausgabenlimit, kein fester Umkreis.",
    deps({
      mistral: routed({
        location: '{"standorte":["Renningen"],"formular":"Renningen","umkreis_km":30}',
        context:
          '{"ausgabenlimit_eur":null,"umkreis_km":null,"formular":null,"quellen":{"ausgabenlimit_eur":["user"],"umkreis_km":["user"],"formular":["clickup"]}}',
      }),
    }),
  );
  expect(out.spendCapEuros).toBeUndefined();
  expect(out.radiusKm).toBeUndefined();
  // Ohne „user“ ist ein null kein Streichen – das Modell hat nur nichts gesagt.
  expect(out.formHint).toEqual({ value: "Renningen", sources: ["clickup"] });
  expect(out.dailyBudgetEuros).toEqual({ value: 17.05, sources: ["clickup"] });
});

test("Kampagnenkontext: nur die Aufgabe als Beleg – kein Aufruf, Zeile übersprungen", async () => {
  const events: string[] = [];
  let contextCalls = 0;
  const out = await assembleBrief(
    "t1",
    "   ",
    deps({
      findFolders: async () => [],
      mistral: async (c, opts) => {
        if (typeof c === "string" && c.includes("Kampagnenkontext")) contextCalls++;
        return routed({ location: '{"standorte":["Renningen"],"formular":null}' })(c, opts);
      },
    }),
    (e) => events.push(`${e.step}:${e.status}`),
  );
  expect(contextCalls).toBe(0);
  expect(events).toContain("context:skipped");
  expect(out.roles).toEqual({ value: ["PFK"], sources: ["clickup"] });
  expect(out.locations).toEqual({ value: ["Renningen"], sources: ["clickup"] });
  expect(out.warnings.join(" ")).not.toMatch(/Kampagnenkontext/);
});

test("Kampagnenkontext: ein Hinweis allein reicht, damit die Auflösung läuft", async () => {
  let contextCalls = 0;
  await assembleBrief(
    "t1",
    "Nur PA",
    deps({
      findFolders: async () => [],
      mistral: async (c, opts) => {
        if (typeof c === "string" && c.includes("Kampagnenkontext")) contextCalls++;
        return routed({})(c, opts);
      },
    }),
  );
  expect(contextCalls).toBe(1);
});

test("parseCampaignContext verwirft unbekannte Quellen, leere Rollen, unpositive Beträge und Radien", () => {
  const out = parseCampaignContext(
    JSON.stringify({
      stellen: ["", "Pflegefachkraft", "Praxisanleiter"],
      standorte: ["Renningen", "renningen"],
      umkreis_km: 0,
      tagesbudget_eur: -5,
      ausgabenlimit_eur: "2000",
      benefits: ["- Jobrad"],
      textanweisungen: "  Keine Emojis.  ",
      quellen: { stellen: ["clickup", "wiki", "user"], standorte: ["onboarding"], ausgabenlimit_eur: ["clickup"], benefits: [] },
    }),
  );
  expect(out.roles).toEqual(["PFK"]);
  expect(out.roleFreeText).toBe("Praxisanleiter");
  expect(out.locations).toEqual(["Renningen"]);
  expect(out.radiusKm).toBeUndefined();
  expect(out.dailyBudgetEuros).toBeUndefined();
  expect(out.spendCapEuros).toBe(2000);
  expect(out.benefits).toEqual(["Jobrad"]);
  expect(out.copyInstructions).toBe("Keine Emojis.");
  expect(out.sources).toEqual({ roles: ["clickup", "user"], locations: ["onboarding"], spendCapEuros: ["clickup"] });
  expect(() => parseCampaignContext("nix")).toThrow();
});
