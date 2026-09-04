import { expect, test } from "bun:test";
import { assembleBrief, parseLocationHint, parseOnboarding, type BriefDeps } from "./brief";
import type { Brief } from "./clickup";

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
  ).toEqual({ benefits: ["jedes 2. Wochenende bleibt frei", "33 Urlaubstage"], roles: ["FK", "PDL"], roleFreeText: "XYZ" });
  // Die Tabelle aus der Probe vom 2026-09-04: PA, FK, Praxisanleiter.
  expect(parseOnboarding('{"benefits":[],"stellen":["PA","FK","Praxisanleiter","Pflegefachkraft"]}')).toEqual({
    benefits: [],
    roles: ["PA", "FK", "PFK"],
    roleFreeText: "Praxisanleiter",
  });
});

test("parseOnboarding: leere oder fehlende Listen sind leer, kein Fehler", () => {
  expect(parseOnboarding("{}")).toEqual({ benefits: [], roles: [], roleFreeText: "" });
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
    typeof content === "string" && content.includes("CSV")
      ? '{"benefits":["33 Urlaubstage","Jobrad"],"rollen":[]}'
      : '{"adresse":"Mühlgasse 24, 71272 Renningen","ort":"Renningen","formular":"Renningen"}',
  customerOverview: async () => ({}),
  ...over,
});

// keine Adresse aus der Aufgabenbeschreibung – Mistral findet dort nichts
const noAddressMistral: BriefDeps["mistral"] = async (c) =>
  typeof c === "string" && c.includes("CSV")
    ? '{"benefits":[],"rollen":[]}'
    : '{"adresse":null,"ort":null,"formular":null}';

test("assembleBrief: keine Adresse in der Aufgabe → Standort aus der Kundenübersicht", async () => {
  const out = await assembleBrief(
    "t1",
    deps({
      getBrief: async () => ({ ...brief, folderId: "f1" }),
      mistral: noAddressMistral,
      customerOverview: async (folderId) => {
        expect(folderId).toBe("f1");
        return { address: "Am Illgenberg 2, 76530 Baden-Baden" };
      },
    }),
  );
  expect(out.locations).toEqual({ value: ["Am Illgenberg 2, 76530 Baden-Baden"], source: "clickup" });
});

test("assembleBrief: Adresse schon aus der Beschreibung → Kundenübersicht wird nicht angefragt", async () => {
  let calls = 0;
  const out = await assembleBrief(
    "t1",
    deps({
      getBrief: async () => ({ ...brief, folderId: "f1" }),
      customerOverview: async () => {
        calls++;
        return { address: "sollte nie ankommen" };
      },
    }),
  );
  expect(out.locations).toEqual({ value: ["Mühlgasse 24, 71272 Renningen"], source: "clickup" });
  expect(calls).toBe(0);
});

test("assembleBrief: Kundenübersicht nicht lesbar → Warnung, kein Standort", async () => {
  const out = await assembleBrief(
    "t1",
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
  expect(out.roles).toEqual({ value: ["PDL"], source: "clickup" });
});

test("assembleBrief füllt alles aus ClickUp und der Onboarding-Tabelle, mit Herkunft", async () => {
  const out = await assembleBrief("t1", deps());
  expect(out.clientName).toEqual({ value: "MeVita Pflegedienst GmbH", source: "clickup" });
  expect(out.roles).toEqual({ value: ["FK"], source: "clickup" });
  expect(out.dailyBudgetEuros).toEqual({ value: 17.05, source: "clickup" });
  expect(out.spendCapEuros).toEqual({ value: 2435, source: "clickup" });
  expect(out.locations).toEqual({ value: ["Mühlgasse 24, 71272 Renningen"], source: "clickup" });
  expect(out.formHint).toEqual({ value: "Renningen", source: "clickup" });
  expect(out.benefits).toEqual({ value: "33 Urlaubstage\nJobrad", source: "onboarding" });
  expect(out.driveFolderId).toEqual({ value: "k", source: "clickup" });
  expect(out.notes).toBe(brief.description);
  expect(out.warnings).toEqual([]);
});

test("assembleBrief: Rollen aus dem Aufgabennamen, wenn das Feld eine Notiz ist", async () => {
  const out = await assembleBrief("t1", deps({ getBrief: async () => ({ ...brief, rolesText: "s. OB" }) }));
  expect(out.roles).toEqual({ value: ["PFK"], source: "clickup" });
});

test("assembleBrief: Rollen aus der Onboarding-Tabelle, wenn ClickUp keine hat", async () => {
  const out = await assembleBrief(
    "t1",
    deps({
      getBrief: async () => ({ ...brief, rolesText: undefined, name: "MeVita Kampagne ab 1.9." }),
      mistral: async (c) =>
        typeof c === "string" && c.includes("CSV")
          ? '{"benefits":[],"rollen":["PFK"]}'
          : '{"adresse":null,"ort":null,"formular":null}',
    }),
  );
  expect(out.roles).toEqual({ value: ["PFK"], source: "onboarding" });
  expect(out.benefits).toBeUndefined();
});

test("assembleBrief: Stellen aus der Beschreibung schlagen Aufgabenname und Tabelle", async () => {
  const out = await assembleBrief(
    "t1",
    deps({
      getBrief: async () => ({ ...brief, rolesText: "s. OB" }),
      mistral: async (c) =>
        typeof c === "string" && c.includes("CSV")
          ? '{"benefits":[],"stellen":["FK","PA"]}'
          : '{"standorte":["Renningen"],"formular":null,"stellen":["Praxisanleiter","Pflegedienstleitung"]}',
    }),
  );
  expect(out.roles).toEqual({ value: ["PDL"], source: "clickup" });
  expect(out.roleFreeText).toEqual({ value: "Praxisanleiter", source: "clickup" });
});

test("assembleBrief: schweigt die Aufgabe, kommen die Stellen aus der Tabelle – auch als Freitext", async () => {
  const out = await assembleBrief(
    "t1",
    deps({
      getBrief: async () => ({ ...brief, name: "MeVita - Kampagne", rolesText: undefined }),
      mistral: async (c) =>
        typeof c === "string" && c.includes("CSV")
          ? '{"benefits":[],"stellen":["12h-Dienste als PA","FK","Praxisanleiter"]}'
          : '{"standorte":["Renningen"],"formular":null,"stellen":[]}',
    }),
  );
  // „12h-Dienste als PA“ trägt das Kürzel im Titel – es zählt als PA, nicht als Freitext.
  expect(out.roles).toEqual({ value: ["PA", "FK"], source: "onboarding" });
  expect(out.roleFreeText).toEqual({ value: "Praxisanleiter", source: "onboarding" });
});

test("assembleBrief: nur der Ort, wenn keine Adresse genannt ist", async () => {
  const out = await assembleBrief(
    "t1",
    deps({
      mistral: async (c) =>
        typeof c === "string" && c.includes("CSV")
          ? "{}"
          : '{"adresse":null,"ort":"Renningen","formular":null}',
    }),
  );
  expect(out.locations).toEqual({ value: ["Renningen"], source: "clickup" });
  expect(out.formHint).toBeUndefined();
});

test("assembleBrief: jede Quelle darf ausfallen – Feld leer, Warnung dran, kein Fehler", async () => {
  const out = await assembleBrief(
    "t1",
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
    deps({
      getBrief: async () => ({ ...brief, driveUrl: "https://drive.google.com/drive/folders/LINKED" }),
      folderIdFromUrl: () => "LINKED",
      findFolders: async (n) => {
        folders.push(n);
        return [];
      },
    }),
  );
  expect(out.driveFolderId).toEqual({ value: "LINKED", source: "clickup" });
  expect(folders).toEqual([]);
});

test("assembleBrief: ohne Tabelle im Ordner eine Warnung, der Ordner bleibt", async () => {
  const out = await assembleBrief("t1", deps({ findSheet: async () => undefined }));
  expect(out.driveFolderId?.value).toBe("k");
  expect(out.warnings.join(" ")).toMatch(/Onboarding-Tabelle/);
});

test("assembleBrief: mehrere Standorte in der Beschreibung → alle, in Reihenfolge", async () => {
  const out = await assembleBrief(
    "t1",
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
  const b = await assembleBrief("t1", deps(), (e) => events.push(`${e.step}:${e.status}${e.detail ? ` ${e.detail}` : ""}`));
  expect(b.benefits?.value).toBeDefined();
  // Jede Quelle genau einmal „running“ und einmal abgeschlossen (done/skipped/failed).
  for (const step of ["task", "description", "drive", "onboarding"] as const) {
    expect(events.filter((e) => e.startsWith(`${step}:running`))).toHaveLength(1);
    expect(events.filter((e) => e.startsWith(`${step}:done`))).toHaveLength(1);
  }
  // Die Kundenübersicht wird nicht gefragt, wenn die Beschreibung den Ort hergab – aber gemeldet.
  expect(events.filter((e) => e.startsWith("overview:skipped"))).toHaveLength(1);
  expect(events.find((e) => e.startsWith("task:done"))).toContain("17,05");
  expect(events.find((e) => e.startsWith("description:done"))).toContain("Renningen");
  expect(events.find((e) => e.startsWith("onboarding:done"))).toContain("Benefits");
});
