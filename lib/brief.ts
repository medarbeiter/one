/**
 * Der Auftrag, zusammengesetzt: was der Assistent über eine Kampagne wissen
 * kann, bevor jemand tippt. Vier Quellen; ClickUp-Aufgabe, Onboarding-Tabelle
 * und die Kundenübersicht laufen nebeneinander, keine darf blocken – ein
 * Ausfall lässt das Feld leer und hinterlässt eine Warnung, die der Vorschlag
 * zeigt.
 *
 *   ClickUp-Aufgabe         Kunde, Budget, Limit, Rollen, Drive-Link, Beschreibung
 *   Mistral über die        Standort (Adresse oder Ort), Hinweis aufs Formular
 *   Beschreibung
 *   Onboarding-Tabelle      Benefits („Besteht aktuell“), Rollen
 *   (Drive, über Mistral)
 *   ClickUp-Kundenübersicht Standort, Rollen – Fallback per Regex, nie über Mistral
 *   (Doc im Kundenordner)
 *
 * Standort-Priorität: Beschreibung (Mistral) → Kundenübersicht (Regex) →
 * letzte Kampagne (lebt im Wizard-Prefill, nicht hier). Die Kundenübersicht
 * wird nur angefragt, wenn die Beschreibung keinen Ort liefert.
 *
 * Jeder Wert trägt seine Herkunft: das Etikett steht im Vorschlag am Feld,
 * damit ein falsch gelesener Wert auffällt statt unbemerkt in die Anzeige zu
 * wandern. Alles Netz ist injizierbar (BriefDeps) – der Zusammenbau ist
 * damit ohne ClickUp, Drive und Mistral prüfbar.
 */
import { mistral as realMistral } from "./bodies";
import {
  customerOverview as realCustomerOverview,
  getBrief as realGetBrief,
  parseRoles,
  rolesFromTaskName,
  type Brief,
} from "./clickup";
import {
  bestLanding as realBestLanding,
  exportCsv as realExportCsv,
  findFolders as realFindFolders,
  findSheet as realFindSheet,
  folderIdFromUrl as realFolderIdFromUrl,
  type DriveFile,
} from "./drive";
import { ROLES } from "./naming";

export type Source = "clickup" | "onboarding" | "previous" | "session";
export type Sourced<T> = { value: T; source: Source };

/**
 * Was der Zusammenbau gerade tut – eine Meldung je Quelle, beim Start und beim
 * Ende. Der Vorschlag entsteht aus vier Netzquellen und zwei Modell-Aufrufen,
 * zusammen leicht zehn Sekunden; ohne diese Meldungen stünde die ganze Zeit ein
 * Knopf mit Spinner. `detail` sagt in einem Satz, was gefunden wurde („17,05 €
 * pro Tag · Rollen FK“) – es ist die Herkunft, bevor sie am Feld steht.
 */
export type BriefStep = "task" | "description" | "drive" | "onboarding" | "overview";
export type BriefEvent = {
  type: "step";
  step: BriefStep;
  status: "running" | "done" | "skipped" | "failed";
  detail?: string;
};
export type OnBriefEvent = (event: BriefEvent) => void;

const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export type AssembledBrief = {
  taskId: string;
  clientName?: Sourced<string>;
  roles?: Sourced<string[]>;
  roleFreeText?: Sourced<string>;
  benefits?: Sourced<string>;
  /** Ein Eintrag je Anzeigengruppe: Adresse oder Ort. Mehrere Standorte → mehrere Gruppen. */
  locations?: Sourced<string[]>;
  /** Ein Name oder Ort, nach dem das Lead-Formular zu wählen ist („Renningen“). */
  formHint?: Sourced<string>;
  dailyBudgetEuros?: Sourced<number>;
  spendCapEuros?: Sourced<number>;
  driveFolderId?: Sourced<string>;
  /** Die Beschreibung der Aufgabe, wörtlich – Anweisungen für Menschen. */
  notes?: string;
  warnings: string[];
};

export type BriefDeps = {
  getBrief: (taskId: string) => Promise<Brief>;
  findFolders: (name: string) => Promise<DriveFile[]>;
  bestLanding: (folders: DriveFile[]) => Promise<{ landed: { path: DriveFile[] } | null }>;
  folderIdFromUrl: (url: string) => string | undefined;
  findSheet: (folderId: string) => Promise<DriveFile | undefined>;
  exportCsv: (fileId: string) => Promise<string>;
  mistral: (content: string, opts?: { temperature?: number }) => Promise<string>;
  customerOverview: (folderId: string) => Promise<{ address?: string; rolesText?: string }>;
};

const realDeps: BriefDeps = {
  getBrief: realGetBrief,
  findFolders: realFindFolders,
  bestLanding: realBestLanding,
  folderIdFromUrl: realFolderIdFromUrl,
  findSheet: realFindSheet,
  exportCsv: realExportCsv,
  mistral: realMistral,
  customerOverview: realCustomerOverview,
};

const unfence = (s: string) => s.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Antwort auf locationPrompt(). Wirft bei Unlesbarem – der Aufrufer macht eine
 * Warnung daraus. `standorte` ist die Liste; die alten Schlüssel `adresse`/`ort`
 * (ein Standort) werden weiter verstanden.
 */
export function parseLocationHint(content: string): { locations: string[]; formHint?: string } {
  let data: { standorte?: unknown; adresse?: unknown; ort?: unknown; formular?: unknown };
  try {
    data = JSON.parse(unfence(content));
  } catch {
    throw new Error("Mistral hat kein lesbares JSON geliefert.");
  }
  const seen = new Set<string>();
  const locations: string[] = [];
  const add = (v: unknown) => {
    const t = str(v);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      locations.push(t);
    }
  };
  if (Array.isArray(data.standorte)) data.standorte.forEach(add);
  else add(str(data.adresse) ?? str(data.ort));
  const out: { locations: string[]; formHint?: string } = { locations };
  const formHint = str(data.formular);
  if (formHint) out.formHint = formHint;
  return out;
}

const CODES = new Map(ROLES.map((r) => [r.code.toLowerCase(), r.code]));

/** Antwort auf onboardingPrompt(). Rollen nur, wenn sie ein Kürzel aus ROLES sind. */
export function parseOnboarding(content: string): { benefits: string[]; roles: string[] } {
  let data: { benefits?: unknown; rollen?: unknown };
  try {
    data = JSON.parse(unfence(content));
  } catch {
    throw new Error("Mistral hat kein lesbares JSON geliefert.");
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => Boolean(s)) : []);
  const roles: string[] = [];
  for (const r of list(data.rollen)) {
    const code = CODES.get(r.toLowerCase());
    if (code && !roles.includes(code)) roles.push(code);
  }
  return { benefits: list(data.benefits).map((b) => b.replace(/^[-–•*]\s*/, "")), roles };
}

function locationPrompt(description: string): string {
  return `Das ist die Beschreibung einer Aufgabe zum Anlegen einer Meta-Stellenanzeigen-Kampagne für einen Pflege-Arbeitgeber.

Lies heraus:
1. Die Standorte, für die je eine eigene Anzeigengruppe entstehen soll – jede Einrichtung, jeder Ort, jede Stadt, die die Beschreibung als Ziel nennt. Je Standort ein Eintrag: die vollständige Adresse (Straße, PLZ, Ort), falls genannt, sonst nur der Ortsname. Nennt die Beschreibung keinen Standort, eine leere Liste. Ein Standort, der nur als Sitz des Unternehmens erwähnt wird und nicht als Ziel der Anzeigen, zählt nicht.
2. Einen Hinweis, welches Lead-Formular zu wählen ist – ein Name oder Ort, wie er in der Beschreibung steht (z. B. „Renningen“). Nennt die Beschreibung keins, null.

Erfinde nichts. Antworte ausschließlich mit JSON: {"standorte": ["…"], "formular": "…" oder null}

BESCHREIBUNG:
${description}`;
}

function onboardingPrompt(csv: string): string {
  const codes = ROLES.map((r) => `${r.code} = ${r.label}`).join(", ");
  return `Das ist der CSV-Export der Onboarding-Tabelle eines Pflege-Arbeitgebers.

Lies heraus:
1. Benefits: AUSSCHLIESSLICH aus dem Block „Wie gestaltet sich Ihr Jobangebot?“, und dort nur die Zeilen unter „Besteht aktuell“. Zeilen unter „Weitere Vorschläge“ oder einer ähnlichen Überschrift NIEMALS übernehmen – auch nicht, wenn sie stärker klingen. Jede Zeile wörtlich, ohne führendes „- “.
2. Rollen: aus „Welche fachlichen Voraussetzungen muss der Kandidat erfüllen?“, als Kürzel aus dieser Liste: ${codes}. Nur Kürzel, die klar passen (exam. FK → FK, Pflegefachkraft → PFK); im Zweifel weglassen.

Antworte ausschließlich mit JSON: {"benefits": ["…"], "rollen": ["FK"]}

CSV:
${csv}`;
}

async function readOnboarding(
  brief: Brief,
  deps: BriefDeps,
  warnings: string[],
  emit: OnBriefEvent,
): Promise<{ folderId?: string; benefits: string[]; roles: string[] }> {
  emit({ type: "step", step: "drive", status: "running" });
  let folderId = brief.driveUrl ? deps.folderIdFromUrl(brief.driveUrl) : undefined;
  if (folderId) emit({ type: "step", step: "drive", status: "done", detail: "Drive-Link aus der Aufgabe" });
  if (!folderId) {
    try {
      const { landed } = await deps.bestLanding(await deps.findFolders(brief.customer));
      folderId = landed?.path[0]?.id;
      if (folderId)
        emit({
          type: "step",
          step: "drive",
          status: "done",
          detail: landed!.path.map((p) => p.name).join(" › "),
        });
    } catch (e) {
      warnings.push(`Drive nicht erreichbar: ${(e as Error).message}`);
      emit({ type: "step", step: "drive", status: "failed", detail: (e as Error).message });
      emit({ type: "step", step: "onboarding", status: "skipped", detail: "ohne Drive-Ordner" });
      return { benefits: [], roles: [] };
    }
  }
  if (!folderId) {
    warnings.push(`Kein Drive-Ordner für „${brief.customer}“ gefunden – Benefits bitte eintragen.`);
    emit({ type: "step", step: "drive", status: "failed", detail: `kein Ordner für „${brief.customer}“` });
    emit({ type: "step", step: "onboarding", status: "skipped", detail: "ohne Drive-Ordner" });
    return { benefits: [], roles: [] };
  }
  emit({ type: "step", step: "onboarding", status: "running" });
  try {
    const sheet = await deps.findSheet(folderId);
    if (!sheet) {
      warnings.push("Keine Onboarding-Tabelle im Drive-Ordner gefunden – Benefits bitte eintragen.");
      emit({ type: "step", step: "onboarding", status: "failed", detail: "keine Tabelle im Ordner" });
      return { folderId, benefits: [], roles: [] };
    }
    const parsed = parseOnboarding(await deps.mistral(onboardingPrompt(await deps.exportCsv(sheet.id)), { temperature: 0 }));
    emit({
      type: "step",
      step: "onboarding",
      status: "done",
      detail: [
        `${parsed.benefits.length} Benefits aus „Besteht aktuell“`,
        parsed.roles.length ? `Rollen ${parsed.roles.join(", ")}` : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
    });
    return { folderId, ...parsed };
  } catch (e) {
    warnings.push(`Onboarding-Tabelle nicht gelesen: ${(e as Error).message}`);
    emit({ type: "step", step: "onboarding", status: "failed", detail: (e as Error).message });
    return { folderId, benefits: [], roles: [] };
  }
}

export async function assembleBrief(
  taskId: string,
  deps: BriefDeps = realDeps,
  emit: OnBriefEvent = () => {},
): Promise<AssembledBrief> {
  const warnings: string[] = [];
  emit({ type: "step", step: "task", status: "running" });
  const brief = await deps.getBrief(taskId);
  const out: AssembledBrief = { taskId, warnings };
  if (brief.customer) out.clientName = { value: brief.customer, source: "clickup" };
  if (brief.description.trim()) out.notes = brief.description.trim();
  if (brief.dailyBudgetEuros) out.dailyBudgetEuros = { value: brief.dailyBudgetEuros, source: "clickup" };
  if (brief.spendCapEuros) out.spendCapEuros = { value: brief.spendCapEuros, source: "clickup" };

  // Das Feld vor dem Namen: es ist die ausdrückliche Angabe. Der Name trägt
  // die Rollen nur, wenn er nach der Konvention gebaut ist.
  const fromField = brief.rolesText ? parseRoles(brief.rolesText) : { roles: [], free: "" };
  const roles = fromField.roles.length ? fromField.roles : rolesFromTaskName(brief.name);
  if (roles.length) out.roles = { value: roles, source: "clickup" };
  if (fromField.roles.length && fromField.free) out.roleFreeText = { value: fromField.free, source: "clickup" };

  emit({
    type: "step",
    step: "task",
    status: "done",
    detail: [
      brief.customer || undefined,
      brief.dailyBudgetEuros ? `${money.format(brief.dailyBudgetEuros)} pro Tag` : undefined,
      brief.spendCapEuros ? `Limit ${money.format(brief.spendCapEuros)}` : undefined,
      roles.length ? `Rollen ${roles.join(", ")}` : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
  });

  const readDescription = async () => {
    if (!brief.description.trim()) {
      emit({ type: "step", step: "description", status: "skipped", detail: "die Aufgabe hat keine Beschreibung" });
      return {} as ReturnType<typeof parseLocationHint>;
    }
    emit({ type: "step", step: "description", status: "running" });
    try {
      const hint = parseLocationHint(await deps.mistral(locationPrompt(brief.description), { temperature: 0 }));
      const found = [
        hint.locations.length > 1
          ? `${hint.locations.length} Standorte: ${hint.locations.join(" · ")}`
          : hint.locations[0],
        hint.formHint ? `Formular „${hint.formHint}“` : undefined,
      ].filter(Boolean);
      emit({
        type: "step",
        step: "description",
        status: "done",
        detail: found.length ? found.join(" · ") : "kein Standort, kein Formular genannt",
      });
      return hint;
    } catch (e) {
      warnings.push(`Standort aus der Aufgabe nicht gelesen: ${(e as Error).message}`);
      emit({ type: "step", step: "description", status: "failed", detail: (e as Error).message });
      return {} as ReturnType<typeof parseLocationHint>;
    }
  };

  const [hint, sheet] = await Promise.all([readDescription(), readOnboarding(brief, deps, warnings, emit)]);

  if (hint.locations?.length) out.locations = { value: hint.locations, source: "clickup" };
  if (hint.formHint) out.formHint = { value: hint.formHint, source: "clickup" };

  if (sheet.folderId) out.driveFolderId = { value: sheet.folderId, source: "clickup" };
  if (sheet.benefits.length) out.benefits = { value: sheet.benefits.join("\n"), source: "onboarding" };
  if (!out.roles && sheet.roles.length) out.roles = { value: sheet.roles, source: "onboarding" };

  // Fallback, nur wenn die Beschreibung keinen Ort hergab – ein Aufruf
  // weniger gegen ClickUp, und die Beschreibung ist ohnehin die genauere
  // Quelle (Adresse statt nur Ort im Kundenordner).
  if (!out.locations && brief.folderId) {
    emit({ type: "step", step: "overview", status: "running" });
    try {
      const overview = await deps.customerOverview(brief.folderId);
      if (overview.address) out.locations = { value: [overview.address], source: "clickup" };
      const roles = overview.rolesText ? parseRoles(overview.rolesText).roles : [];
      if (!out.roles && roles.length) out.roles = { value: roles, source: "clickup" };
      emit({
        type: "step",
        step: "overview",
        status: "done",
        detail:
          [overview.address, roles.length ? `Rollen ${roles.join(", ")}` : undefined].filter(Boolean).join(" · ") ||
          "keine Adresse im Doc",
      });
    } catch (e) {
      warnings.push(`Kundenübersicht nicht gelesen: ${(e as Error).message}`);
      emit({ type: "step", step: "overview", status: "failed", detail: (e as Error).message });
    }
  } else {
    emit({
      type: "step",
      step: "overview",
      status: "skipped",
      detail: out.locations ? "Standort steht schon in der Aufgabe" : "kein Kundenordner an der Aufgabe",
    });
  }

  return out;
}
