import { expect, test } from "bun:test";
import { adsFrom, alreadyHandled, autopilotTask, commentFor, DONE, MARKER, type Asset, type AutopilotDeps } from "./autopilot";
import type { AssembledBrief } from "./brief";
import type { Customer } from "./customers";
import type { DriveFile } from "./drive";
import type { WizardSubmission } from "./launch-request";

const brief: AssembledBrief = {
  taskId: "t1",
  clientName: { value: "Pflegedienst Hammonia", sources: ["clickup"] },
  roles: { value: ["PFK"], sources: ["clickup"] },
  locations: { value: ["Mühlgasse 24, 71272 Renningen"], sources: ["clickup"] },
  formHint: { value: "Renningen", sources: ["clickup"] },
  dailyBudgetEuros: { value: 20, sources: ["clickup"] },
  benefits: { value: "Dienstwagen", sources: ["onboarding"] },
  aiNotes: "",
  copyInstructions: "",
  assigneeName: "Maria Anna Huber",
  warnings: ["Keine Onboarding-Tabelle im Drive-Ordner gefunden – Benefits bitte eintragen."],
};

const customers: Customer[] = [
  { source: "act_1", id: "medarbeiter", name: "MedArbeiter", adAccounts: [{ id: "act_1", name: "MA" } as never], access: {} as never, issues: [] },
  { source: "p1", id: "hammonia", name: "Pflegedienst Hammonia", page: { id: "p1", name: "Hammonia" } as never, adAccounts: [], access: {} as never, issues: [] },
];

const file = (name: string, mimeType: string): DriveFile => ({ id: name, name, mimeType });
const asset = (f: DriveFile, orientation: Asset["orientation"]): Asset =>
  f.mimeType.startsWith("video/")
    ? { fileName: f.name, kind: "video", orientation, format: { kind: "video", videoId: `v-${f.name}`, fileName: f.name } }
    : { fileName: f.name, kind: "image", orientation, format: { kind: "image", hash: `h-${f.name}`, fileName: f.name } };

function deps(sent: WizardSubmission[]): AutopilotDeps {
  return {
    assembleBrief: async () => brief,
    listCustomers: async () => ({ customers }),
    listLeadForms: async () => [
      { id: "f1", name: "Renningen Formular" } as never,
      { id: "f2", name: "Stuttgart Formular" } as never,
    ],
    fitRadius: async () => ({ radiusKm: 25, enough: true }),
    driveMedia: async () => ({
      path: "Hammonia › Werbemotive",
      files: [file("Lea 1.MOV", "video/quicktime"), file("Creative 1.jpg", "image/jpeg"), file("Creative 2.jpg", "image/jpeg")],
    }),
    upload: async (f) => asset(f, f.name === "Creative 1.jpg" || f.mimeType.startsWith("video/") ? "portrait" : "square"),
    texts: async () => ({ bodies: ["a", "b"], titles: ["x", "y"], description: "✅ Dienstwagen" }),
    launch: async (s) => {
      sent.push(s);
      return { campaignId: "c9", adSets: [{ index: 0, id: "s1", name: s.adSets[0].name, adIds: [] }], failed: [] };
    },
    now: () => new Date(2026, 8, 7),
  };
}

test("autopilotTask baut aus Aufgabe, Drive und Texten die Kampagne und legt sie an", async () => {
  const sent: WizardSubmission[] = [];
  const out = await autopilotTask("t1", deps(sent));
  expect("campaignId" in out && out.campaignId).toBe("c9");
  const s = sent[0];
  expect(s.clientId).toBe("hammonia");
  expect(s.adAccount).toBe("act_1");
  expect(s.campaignName).toBe("Pflegedienst Hammonia - PFK ab 07.09.26 MH (via One)");
  expect(s.dailyBudgetCents).toBe(2000);
  expect(s.adSets).toHaveLength(1);
  expect(s.adSets[0]).toMatchObject({ name: "Ads", radiusKm: 25, formId: "f1", bodies: ["a", "b"] });
  expect(s.adSets[0].ads.map((a) => `${a.type}:${a.name}`)).toEqual(["ugc:Lea 1", "split:Creative 1"]);
  // Die Warnungen des Auftrags und die Lücken des Laufs stehen im Ergebnis – für den Kommentar.
  expect(out.notes).toEqual([
    "Keine Onboarding-Tabelle im Drive-Ordner gefunden – Benefits bitte eintragen.",
    "Texte Renningen: nur 2 von 5 Primärtexten geschrieben.",
  ]);
});

test("autopilotTask sammelt alle billigen Gründe, bevor es anhält", async () => {
  const d = deps([]);
  const bad = {
    ...d,
    assembleBrief: async () => ({ ...brief, clientName: { value: "Niemand", sources: [] }, locations: undefined, roles: undefined }),
  };
  const out = await autopilotTask("t1", bad as AutopilotDeps);
  expect("halts" in out && out.halts).toEqual([
    "Kunde: „Niemand“ steht nicht eindeutig in der Meta-Kundenliste.",
    "Standort: keiner in Aufgabe, Onboarding oder Kundenübersicht gefunden.",
    "Gesuchte Stellen: keine gefunden.",
  ]);
});

test("autopilotTask legt ohne eindeutiges Formular trotzdem an – mit dem ersten der Seite und einer Warnung", async () => {
  const sent: WizardSubmission[] = [];
  const d = deps(sent);
  const noHint = { ...d, assembleBrief: async () => ({ ...brief, formHint: undefined }) };
  const out = await autopilotTask("t1", noHint);
  expect("campaignId" in out).toBe(true);
  expect(sent[0].adSets[0].formId).toBe("f1");
  expect(out.notes).toContain("Lead-Formular: die Seite hat 2 und die Aufgabe nennt keins – vorläufig „Renningen Formular“, beim Prüfen setzen.");
  const wrongHint = { ...d, assembleBrief: async () => ({ ...brief, formHint: { value: "Berlin", sources: ["clickup"] as never } }) };
  const out2 = await autopilotTask("t1", wrongHint);
  expect("campaignId" in out2).toBe(true);
  expect(out2.notes).toContain("Lead-Formular: keins passt eindeutig zu „Berlin“ – vorläufig „Renningen Formular“, beim Prüfen setzen.");
});

test("autopilotTask hält an, wo der Wizard eine Person braucht", async () => {
  const d = deps([]);
  // Ohne ein einziges Formular lehnt Meta jede Lead-Anzeige ab – da hilft kein Platzhalter.
  const noForms = { ...d, listLeadForms: async () => [] };
  expect(await autopilotTask("t1", noForms)).toMatchObject({ halts: ["Lead-Formular: die Seite hat keins – eins im Baukasten anlegen."] });
  const empty = { ...d, driveMedia: async () => ({ path: "", files: [] }) };
  expect(await autopilotTask("t1", empty)).toMatchObject({ halts: [expect.stringContaining("kein Kundenordner")] });
});

test("adsFrom: Videos werden UGC, ein Hoch- und ein Querbild ein Paar, der Rest bleibt liegen", () => {
  const { ads, unpaired } = adsFrom([
    asset(file("Lea.MOV", "video/mp4"), "portrait"),
    asset(file("page-1.jpg", "image/jpeg"), "portrait"),
    asset(file("page-2.jpg", "image/jpeg"), "square"),
    asset(file("solo.jpg", "image/jpeg"), "square"),
  ]);
  expect(ads.map((a) => a.type)).toEqual(["ugc", "split"]);
  expect(unpaired).toEqual(["solo.jpg"]);
});

test("alreadyHandled: ein Marker-Kommentar zählt nur, wenn die Aufgabe seither ruht", () => {
  const c = [{ text: `${MARKER} Nicht automatisch angelegt`, date: 100 }];
  expect(alreadyHandled(c, 50)).toBe(true);
  expect(alreadyHandled(c, 200)).toBe(false);
  expect(alreadyHandled([{ text: "Hallo", date: 100 }], 50)).toBe(false);
  // Angelegt heißt angelegt – auch wenn die Aufgabe später geändert wird.
  expect(alreadyHandled([{ text: `${DONE} (pausiert): N`, date: 100 }], 200)).toBe(true);
});

test("commentFor nennt Prüf-Link, Ads Manager und jede Lücke", () => {
  const text = commentFor({ campaignId: "c9", campaignName: "N", adAccount: "act_1", notes: ["Bild ohne Partner: solo.jpg"] }, "https://one.example");
  expect(text).toContain("https://one.example/campaigns/c9");
  expect(text).toContain("act=1&selected_campaign_ids=c9");
  expect(text).toContain("Nicht erledigt oder ausgelassen:\n– Bild ohne Partner: solo.jpg");
  const halted = commentFor({ halts: ["Kunde: fehlt"], notes: ["Benefits: keine gefunden"] }, "https://one.example");
  expect(halted).toContain("Woran es hängt:\n– Kunde: fehlt");
  expect(halted).toContain("– Benefits: keine gefunden");
  expect(halted).toContain("https://one.example/campaigns/new");
});
