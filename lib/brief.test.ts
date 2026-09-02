import { expect, test } from "bun:test";
import { assembleBrief, parseLocationHint, parseOnboarding, type BriefDeps } from "./brief";
import type { Brief } from "./clickup";

test("parseLocationHint nimmt Adresse, Ort und Formular-Hinweis aus dem JSON", () => {
  expect(
    parseLocationHint('{"adresse":"Mühlgasse 24+26, 71272 Renningen","ort":"Renningen","formular":"Renningen"}'),
  ).toEqual({ address: "Mühlgasse 24+26, 71272 Renningen", city: "Renningen", formHint: "Renningen" });
});

test("parseLocationHint verträgt Markdown-Zaun und null-Werte", () => {
  expect(parseLocationHint('```json\n{"adresse":null,"ort":null,"formular":null}\n```')).toEqual({});
});

test("parseLocationHint wirft bei Unlesbarem", () => {
  expect(() => parseLocationHint("keine Ahnung")).toThrow();
});

test("parseOnboarding liefert Benefits als Zeilen und nur bekannte Rollen-Kürzel", () => {
  expect(
    parseOnboarding('{"benefits":["jedes 2. Wochenende bleibt frei","33 Urlaubstage"],"rollen":["FK","XYZ","pdl"]}'),
  ).toEqual({ benefits: ["jedes 2. Wochenende bleibt frei", "33 Urlaubstage"], roles: ["FK", "PDL"] });
});

test("parseOnboarding: leere oder fehlende Listen sind leer, kein Fehler", () => {
  expect(parseOnboarding("{}")).toEqual({ benefits: [], roles: [] });
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
  ...over,
});

test("assembleBrief füllt alles aus ClickUp und der Onboarding-Tabelle, mit Herkunft", async () => {
  const out = await assembleBrief("t1", deps());
  expect(out.clientName).toEqual({ value: "MeVita Pflegedienst GmbH", source: "clickup" });
  expect(out.roles).toEqual({ value: ["FK"], source: "clickup" });
  expect(out.dailyBudgetEuros).toEqual({ value: 17.05, source: "clickup" });
  expect(out.spendCapEuros).toEqual({ value: 2435, source: "clickup" });
  expect(out.location).toEqual({ value: { addressString: "Mühlgasse 24, 71272 Renningen" }, source: "clickup" });
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
  expect(out.location).toEqual({ value: { addressString: "Renningen" }, source: "clickup" });
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
  expect(out.location).toBeUndefined();
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
