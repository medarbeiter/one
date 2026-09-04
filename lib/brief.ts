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
  rolesFromTitles,
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
  /** Ein in der Aufgabe genannter Umkreis – dann wählt der Assistent keinen. */
  radiusKm?: Sourced<number>;
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
  customerOverview: (folderId: string) => Promise<{ address?: string; rolesText?: string; radiusKm?: number }>;
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
export type LocationHint = { locations: string[]; formHint?: string; radiusKm?: number; titles: string[] };

export function parseLocationHint(content: string): LocationHint {
  let data: {
    standorte?: unknown;
    adresse?: unknown;
    ort?: unknown;
    formular?: unknown;
    umkreis_km?: unknown;
    stellen?: unknown;
  };
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
  const out: LocationHint = { locations, titles: strings(data.stellen) };
  const formHint = str(data.formular);
  if (formHint) out.formHint = formHint;
  const radiusKm = Number(data.umkreis_km);
  if (Number.isFinite(radiusKm) && radiusKm > 0) out.radiusKm = Math.round(radiusKm);
  return out;
}

const strings = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => Boolean(s)) : []);

/**
 * Antwort auf onboardingPrompt(). Die Stellen kommen, wie sie in der Tabelle
 * stehen; `rolesFromTitles` macht Kürzel daraus, wo eins passt, und lässt den
 * Rest als Freitext („Praxisanleiter“). Der alte Schlüssel `rollen` (nur
 * Kürzel) wird weiter verstanden.
 */
export function parseOnboarding(content: string): { benefits: string[]; roles: string[]; roleFreeText: string } {
  let data: { benefits?: unknown; rollen?: unknown; stellen?: unknown };
  try {
    data = JSON.parse(unfence(content));
  } catch {
    throw new Error("Mistral hat kein lesbares JSON geliefert.");
  }
  const { roles, free } = rolesFromTitles([...strings(data.stellen), ...strings(data.rollen)]);
  return { benefits: strings(data.benefits).map((b) => b.replace(/^[-–•*]\s*/, "")), roles, roleFreeText: free };
}

function locationPrompt(description: string): string {
  return `Das ist die Beschreibung einer Aufgabe zum Anlegen einer Meta-Stellenanzeigen-Kampagne für einen Pflege-Arbeitgeber.

Lies heraus:
1. Die Standorte, für die je eine eigene Anzeigengruppe entstehen soll – jede Einrichtung, jeder Ort, jede Stadt, die die Beschreibung als Ziel nennt. Je Standort ein Eintrag: die vollständige Adresse (Straße, PLZ, Ort), falls genannt, sonst nur der Ortsname. Nennt die Beschreibung keinen Standort, eine leere Liste. Ein Standort, der nur als Sitz des Unternehmens erwähnt wird und nicht als Ziel der Anzeigen, zählt nicht.
2. Einen Hinweis, welches Lead-Formular zu wählen ist – ein Name oder Ort, wie er in der Beschreibung steht (z. B. „Renningen“). Nennt die Beschreibung keins, null.
3. Einen ausdrücklich genannten Umkreis bzw. Radius in Kilometern („Umkreis 30 km“, „Radius: 25km“). Steht keiner drin, null – nie schätzen.
4. Die gesuchten Stellen, falls die Beschreibung welche nennt – jede Stelle als kurze Berufsbezeichnung, so wie sie dasteht („PFK“, „Pflegefachkraft“, „Praxisanleiter“). Ein Standort ist keine Stelle. Nennt die Beschreibung keine, eine leere Liste.

Erfinde nichts. Antworte ausschließlich mit JSON: {"standorte": ["…"], "formular": "…" oder null, "umkreis_km": Zahl oder null, "stellen": ["…"]}

BESCHREIBUNG:
${description}`;
}

function onboardingPrompt(csv: string): string {
  const codes = ROLES.map((r) => `${r.code} = ${r.label}`).join(", ");
  return `Das ist der CSV-Export der Onboarding-Tabelle eines Pflege-Arbeitgebers.

Lies heraus:
1. Benefits: AUSSCHLIESSLICH aus dem Block „Wie gestaltet sich Ihr Jobangebot?“, und dort nur die Zeilen unter „Besteht aktuell“. Zeilen unter „Weitere Vorschläge“ oder einer ähnlichen Überschrift NIEMALS übernehmen – auch nicht, wenn sie stärker klingen. Jede Zeile wörtlich, ohne führendes „- “.
2. Stellen: AUSSCHLIESSLICH aus dem Block „Welche fachlichen Voraussetzungen muss der Kandidat erfüllen?“. Dort steht, wen der Arbeitgeber sucht – oft mit Datum und Bedingungen („1.9.26: - 12h-Dienste als PA“, „- FK – aktuell nur mit FKs BGs vereinbaren“, „- Praxisanleiter (2 Tage arbeiten, 2 Tage frei)“). Je gesuchter Stelle ein Eintrag, als kurze Berufsbezeichnung ohne die Bedingungen. Wo eins dieser Kürzel klar passt, das Kürzel: ${codes}. Sonst die Bezeichnung, wie sie dasteht (z. B. „Praxisanleiter“). Gehalt, Dienstzeiten, Auszeichnungen sind keine Stellen.

Antworte ausschließlich mit JSON: {"benefits": ["…"], "stellen": ["FK", "Praxisanleiter"]}

CSV:
${csv}`;
}

async function readOnboarding(
  brief: Brief,
  deps: BriefDeps,
  warnings: string[],
  emit: OnBriefEvent,
): Promise<{ folderId?: string; benefits: string[]; roles: string[]; roleFreeText: string }> {
  const none = { benefits: [], roles: [], roleFreeText: "" };
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
      return none;
    }
  }
  if (!folderId) {
    warnings.push(`Kein Drive-Ordner für „${brief.customer}“ gefunden – Benefits bitte eintragen.`);
    emit({ type: "step", step: "drive", status: "failed", detail: `kein Ordner für „${brief.customer}“` });
    emit({ type: "step", step: "onboarding", status: "skipped", detail: "ohne Drive-Ordner" });
    return none;
  }
  emit({ type: "step", step: "onboarding", status: "running" });
  try {
    const sheet = await deps.findSheet(folderId);
    if (!sheet) {
      warnings.push("Keine Onboarding-Tabelle im Drive-Ordner gefunden – Benefits bitte eintragen.");
      emit({ type: "step", step: "onboarding", status: "failed", detail: "keine Tabelle im Ordner" });
      return { folderId, ...none };
    }
    const parsed = parseOnboarding(await deps.mistral(onboardingPrompt(await deps.exportCsv(sheet.id)), { temperature: 0 }));
    emit({
      type: "step",
      step: "onboarding",
      status: "done",
      detail: [
        `${parsed.benefits.length} Benefits aus „Besteht aktuell“`,
        rolesLine(parsed.roles, parsed.roleFreeText),
      ]
        .filter(Boolean)
        .join(" · "),
    });
    return { folderId, ...parsed };
  } catch (e) {
    warnings.push(`Onboarding-Tabelle nicht gelesen: ${(e as Error).message}`);
    emit({ type: "step", step: "onboarding", status: "failed", detail: (e as Error).message });
    return { folderId, ...none };
  }
}

/** „Stellen PFK, PDL · Praxisanleiter“ – für die Werkstatt-Zeile. */
const rolesLine = (roles: string[], free?: string) =>
  roles.length || free ? `Stellen ${[roles.join(", "), free].filter(Boolean).join(" · ")}` : undefined;

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

  // Das Feld vor allem anderen: es ist die ausdrückliche Angabe. Dann die
  // Beschreibung (unten, per Mistral), dann der Name – der trägt die Rollen
  // nur, wenn er nach der Konvention gebaut ist. Die Aufgabe insgesamt vor der
  // Onboarding-Tabelle: wer die Aufgabe schreibt, weiß, was diesmal gesucht
  // wird; die Tabelle sagt, was der Kunde grundsätzlich sucht.
  const fromField = brief.rolesText ? parseRoles(brief.rolesText) : { roles: [], free: "" };
  const roles = fromField.roles;
  if (roles.length) out.roles = { value: roles, source: "clickup" };
  if (fromField.roles.length && fromField.free) out.roleFreeText = { value: fromField.free, source: "clickup" };
  const hasRoles = () => Boolean(out.roles || out.roleFreeText);

  emit({
    type: "step",
    step: "task",
    status: "done",
    detail: [
      brief.customer || undefined,
      brief.dailyBudgetEuros ? `${money.format(brief.dailyBudgetEuros)} pro Tag` : undefined,
      brief.spendCapEuros ? `Limit ${money.format(brief.spendCapEuros)}` : undefined,
      rolesLine(roles, out.roleFreeText?.value),
    ]
      .filter(Boolean)
      .join(" · "),
  });

  const readDescription = async () => {
    if (!brief.description.trim()) {
      emit({ type: "step", step: "description", status: "skipped", detail: "die Aufgabe hat keine Beschreibung" });
      return { locations: [], titles: [] } satisfies LocationHint;
    }
    emit({ type: "step", step: "description", status: "running" });
    try {
      const hint = parseLocationHint(await deps.mistral(locationPrompt(brief.description), { temperature: 0 }));
      const found = [
        hint.locations.length > 1
          ? `${hint.locations.length} Standorte: ${hint.locations.join(" · ")}`
          : hint.locations[0],
        hint.formHint ? `Formular „${hint.formHint}“` : undefined,
        hint.radiusKm ? `Umkreis ${hint.radiusKm} km` : undefined,
        rolesLine(rolesFromTitles(hint.titles).roles, rolesFromTitles(hint.titles).free),
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
      return { locations: [], titles: [] } satisfies LocationHint;
    }
  };

  const [hint, sheet] = await Promise.all([readDescription(), readOnboarding(brief, deps, warnings, emit)]);

  if (hint.locations?.length) out.locations = { value: hint.locations, source: "clickup" };
  if (hint.formHint) out.formHint = { value: hint.formHint, source: "clickup" };
  if (hint.radiusKm) out.radiusKm = { value: hint.radiusKm, source: "clickup" };

  // Stellen: Feld → Beschreibung → Aufgabenname → Onboarding-Tabelle. Sagt
  // die Aufgabe irgendwo etwas, gilt nur das; die Tabelle nur, wenn sie schweigt.
  if (!hasRoles()) {
    const fromDescription = rolesFromTitles(hint.titles);
    const fromName = rolesFromTaskName(brief.name);
    const pick = fromDescription.roles.length || fromDescription.free ? fromDescription : { roles: fromName, free: "" };
    if (pick.roles.length) out.roles = { value: pick.roles, source: "clickup" };
    if (pick.free) out.roleFreeText = { value: pick.free, source: "clickup" };
  }

  if (sheet.folderId) out.driveFolderId = { value: sheet.folderId, source: "clickup" };
  if (sheet.benefits.length) out.benefits = { value: sheet.benefits.join("\n"), source: "onboarding" };
  if (!hasRoles()) {
    if (sheet.roles.length) out.roles = { value: sheet.roles, source: "onboarding" };
    if (sheet.roleFreeText) out.roleFreeText = { value: sheet.roleFreeText, source: "onboarding" };
  }

  // Fallback, nur wenn die Beschreibung keinen Ort hergab – ein Aufruf
  // weniger gegen ClickUp, und die Beschreibung ist ohnehin die genauere
  // Quelle (Adresse statt nur Ort im Kundenordner).
  if (!out.locations && brief.folderId) {
    emit({ type: "step", step: "overview", status: "running" });
    try {
      const overview = await deps.customerOverview(brief.folderId);
      if (overview.address) out.locations = { value: [overview.address], source: "clickup" };
      if (overview.radiusKm && !out.radiusKm) out.radiusKm = { value: overview.radiusKm, source: "clickup" };
      const roles = overview.rolesText ? parseRoles(overview.rolesText).roles : [];
      if (!hasRoles() && roles.length) out.roles = { value: roles, source: "clickup" };
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
