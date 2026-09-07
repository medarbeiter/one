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
 * Sind die Leser fertig, löst ein letzter Mistral-Aufruf (contextPrompt) die
 * Belege aller Quellen und die freien Hinweise der bedienenden Person zu einem
 * Vorschlag auf – erst dort wird entschieden, ob Aufgabe und Onboarding sich
 * ergänzen oder widersprechen. Scheitert nur diese Auflösung, gilt die alte
 * feste Rangfolge (Aufgabe vor Onboarding) und der Brief trägt eine Warnung.
 *
 * Jeder Wert trägt seine Herkunft – eine oder mehrere: das Etikett steht im
 * Vorschlag am Feld, damit ein falsch gelesener Wert auffällt statt unbemerkt
 * in die Anzeige zu wandern. Alles Netz ist injizierbar (BriefDeps) – der
 * Zusammenbau ist damit ohne ClickUp, Drive und Mistral prüfbar.
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

export type Source = "clickup" | "onboarding" | "previous" | "session" | "user";
export type Sourced<T> = { value: T; sources: Source[] };
const SOURCES: readonly Source[] = ["clickup", "onboarding", "previous", "session", "user"];

/**
 * Was der Zusammenbau gerade tut – eine Meldung je Quelle, beim Start und beim
 * Ende. Der Vorschlag entsteht aus vier Netzquellen und zwei Modell-Aufrufen,
 * zusammen leicht zehn Sekunden; ohne diese Meldungen stünde die ganze Zeit ein
 * Knopf mit Spinner. `detail` sagt in einem Satz, was gefunden wurde („17,05 €
 * pro Tag · Rollen FK“) – es ist die Herkunft, bevor sie am Feld steht.
 */
export type BriefStep = "task" | "description" | "drive" | "onboarding" | "overview" | "context";
export type BriefEvent = {
  type: "step";
  step: BriefStep;
  status: "running" | "done" | "skipped" | "failed";
  detail?: string;
  /** Welche Quellen in den Schritt eingingen – der Kontext hat mehrere. */
  sources?: Source[];
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
  /** Die freien Hinweise, mit denen dieser Brief gebaut wurde – für den Entwurf. */
  aiNotes: string;
  /** Stil-, Ton- und Ausschlusswünsche aus den Hinweisen, für jede Textanfrage. */
  copyInstructions: string;
  warnings: string[];
};

/** Was die Leser fanden, bevor jemand entscheidet – Belege, keine Auswahl. */
export type CampaignEvidence = {
  task: {
    id: string;
    name: string;
    description: string;
    rolesText?: string;
    dailyBudgetEuros?: number;
    spendCapEuros?: number;
    /** Aus der Beschreibung, per Mistral (LocationHint). */
    locations: string[];
    formHint?: string;
    radiusKm?: number;
    jobs: string[];
  };
  onboarding: { benefits: string[]; jobs: string[] };
  /** Nur die erlaubten Fakten (overviewFacts) – nie das Doc selbst. */
  overview: { address?: string; rolesText?: string; radiusKm?: number };
  aiNotes: string;
};

type ContextField =
  | "roles"
  | "locations"
  | "formHint"
  | "radiusKm"
  | "benefits"
  | "dailyBudgetEuros"
  | "spendCapEuros"
  | "copyInstructions";

export type ResolvedCampaignContext = {
  roles: string[];
  roleFreeText: string;
  locations: string[];
  formHint?: string;
  radiusKm?: number;
  benefits: string[];
  dailyBudgetEuros?: number;
  spendCapEuros?: number;
  copyInstructions: string;
  sources: Partial<Record<ContextField, Source[]>>;
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
  const locations = uniqStrings(Array.isArray(data.standorte) ? data.standorte : [str(data.adresse) ?? str(data.ort)]);
  const out: LocationHint = { locations, titles: strings(data.stellen) };
  const formHint = str(data.formular);
  if (formHint) out.formHint = formHint;
  const radiusKm = positive(data.umkreis_km);
  if (radiusKm) out.radiusKm = Math.round(radiusKm);
  return out;
}

const strings = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => Boolean(s)) : []);

/** Getrimmt, ohne Leere, ohne Doppelte (Groß/Klein egal), in Reihenfolge. */
function uniqStrings(v: unknown): string[] {
  const seen = new Set<string>();
  return strings(v).filter((t) => {
    if (seen.has(t.toLowerCase())) return false;
    seen.add(t.toLowerCase());
    return true;
  });
}

/** Eine Zahl über null – Beträge und Radien; alles andere undefined. */
function positive(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const stripBullet = (b: string) => b.replace(/^[-–•*]\s*/, "");

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
  return { benefits: strings(data.benefits).map(stripBullet), roles, roleFreeText: free };
}

// Die JSON-Schlüssel des Kontext-Prompts, je Feld des Ergebnisses.
const CONTEXT_KEYS: Record<ContextField, string> = {
  roles: "stellen",
  locations: "standorte",
  formHint: "formular",
  radiusKm: "umkreis_km",
  benefits: "benefits",
  dailyBudgetEuros: "tagesbudget_eur",
  spendCapEuros: "ausgabenlimit_eur",
  copyInstructions: "textanweisungen",
};

/**
 * Antwort auf contextPrompt(), defensiv gelesen wie die anderen: unbekannte
 * Quellen, leere Stellen, unpositive Beträge und Radien fliegen raus. Ein
 * Feld ohne verbliebene Quelle steht nicht in `sources` – der Aufrufer nimmt
 * es dann nicht, denn ein Wert ohne Herkunft ist ein erfundener.
 */
export function parseCampaignContext(content: string): ResolvedCampaignContext {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(unfence(content));
  } catch {
    throw new Error("Mistral hat kein lesbares JSON geliefert.");
  }
  if (!data || typeof data !== "object") throw new Error("Mistral hat kein lesbares JSON geliefert.");
  const { roles, free } = rolesFromTitles(strings(data.stellen));
  const radiusKm = positive(data.umkreis_km);
  const out: ResolvedCampaignContext = {
    roles,
    roleFreeText: free,
    locations: uniqStrings(data.standorte),
    formHint: str(data.formular),
    radiusKm: radiusKm ? Math.round(radiusKm) : undefined,
    benefits: strings(data.benefits).map(stripBullet),
    dailyBudgetEuros: positive(data.tagesbudget_eur),
    spendCapEuros: positive(data.ausgabenlimit_eur),
    copyInstructions: str(data.textanweisungen) ?? "",
    sources: {},
  };
  const quellen = (data.quellen && typeof data.quellen === "object" ? data.quellen : {}) as Record<string, unknown>;
  for (const field of Object.keys(CONTEXT_KEYS) as ContextField[]) {
    const sources = uniqStrings(quellen[CONTEXT_KEYS[field]]).filter((q): q is Source => (SOURCES as string[]).includes(q));
    if (sources.length) out.sources[field] = sources;
  }
  return out;
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

const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- keine");
const opt = (v: string | number | undefined) => (v === undefined || v === "" ? "keine Angabe" : String(v));

/**
 * Die eine Anfrage, die entscheidet. Sie sieht nur die gewählte Aufgabe, die
 * schon extrahierten Onboarding-Werte, die erlaubten Fakten aus der
 * Kundenübersicht und die freien Hinweise – nie das Kundenübersichts-Doc
 * selbst (Passwörter, Kontaktdaten).
 */
function contextPrompt(e: CampaignEvidence): string {
  const codes = ROLES.map((r) => `${r.code} = ${r.label}`).join(", ");
  return `Du löst den Kampagnenkontext einer Meta-Stellenanzeigen-Kampagne für einen Pflege-Arbeitgeber auf: aus den Belegen dreier Quellen wird ein Vorschlag.

Die Quellen heißen "clickup" (die ausgewählte ClickUp-Aufgabe samt Kundenübersicht), "onboarding" (die Onboarding-Tabelle des Kunden) und "user" (freie Hinweise der bedienenden Person).

Regeln:
1. Die Hinweise haben bei einem ausdrücklichen Widerspruch Vorrang vor allem anderen.
2. Die Aufgabe beschreibt den Umfang DIESER Kampagne. Das Onboarding erklärt und ergänzt ihn – es ersetzt ihn nicht blind durch alle Stellen, die der Kunde grundsätzlich sucht. Nennt die Aufgabe keine Stellen, gelten die aus dem Onboarding.
3. Vereinbare Angaben dürfen zusammengeführt werden. Widersprüchliche Angaben werden nicht als Vereinigung ausgegeben – dann entscheiden Regel 1 und 2.
4. Tagesbudget und Ausgabenlimit bleiben die der Aufgabe, außer die Hinweise nennen ausdrücklich einen Betrag als Tagesbudget oder als Ausgabenlimit.
5. Erfinde nichts. Jeder ausgegebene Wert nennt unter "quellen" mindestens eine Quelle, aus der er tatsächlich stammt. Was keine Quelle hergibt, bleibt leer bzw. null.
6. Stellen als Kürzel, wo eins klar passt (${codes}), sonst die Bezeichnung, wie sie dasteht.
7. Stil-, Ton-, Ansprache- und Ausschlusswünsche aus den Hinweisen landen zusätzlich als kurzer Absatz in "textanweisungen"; ohne solche Wünsche "".
8. Soll ein Wert laut Hinweisen entfallen („kein Ausgabenlimit“, „kein fester Umkreis“), gib null bzw. eine leere Liste aus und nenne dafür unter "quellen" die Quelle "user" – nur dann gilt das als Streichen.

Antworte ausschließlich mit JSON: {"stellen": ["…"], "standorte": ["…"], "formular": "…" oder null, "umkreis_km": Zahl oder null, "benefits": ["…"], "tagesbudget_eur": Zahl oder null, "ausgabenlimit_eur": Zahl oder null, "textanweisungen": "…", "quellen": {"stellen": ["clickup"], "standorte": [], "formular": [], "umkreis_km": [], "benefits": [], "tagesbudget_eur": [], "ausgabenlimit_eur": [], "textanweisungen": []}}

AUFGABE (clickup):
Name: ${e.task.name}
Feld „gesuchte Stellen“: ${opt(e.task.rolesText)}
Stellen laut Beschreibung:
${list(e.task.jobs)}
Standorte laut Beschreibung:
${list(e.task.locations)}
Formular: ${opt(e.task.formHint)}
Umkreis km: ${opt(e.task.radiusKm)}
Tagesbudget €: ${opt(e.task.dailyBudgetEuros)}
Ausgabenlimit €: ${opt(e.task.spendCapEuros)}
Beschreibung:
${e.task.description.trim() || "keine"}

KUNDENÜBERSICHT (clickup):
Adresse: ${opt(e.overview.address)}
Stellen: ${opt(e.overview.rolesText)}
Umkreis km: ${opt(e.overview.radiusKm)}

ONBOARDING (onboarding):
Benefits:
${list(e.onboarding.benefits)}
Stellen:
${list(e.onboarding.jobs)}

HINWEISE (user):
${e.aiNotes.trim() || "keine"}`;
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
  aiNotes = "",
  deps: BriefDeps = realDeps,
  emit: OnBriefEvent = () => {},
): Promise<AssembledBrief> {
  const warnings: string[] = [];
  emit({ type: "step", step: "task", status: "running" });
  // Genau diese eine Aufgabe. Geschwister desselben Kunden werden weder
  // gesucht noch zusammengeführt – der Umfang der Kampagne ist die Aufgabe.
  const brief = await deps.getBrief(taskId);
  const out: AssembledBrief = { taskId, aiNotes, copyInstructions: "", warnings };
  if (brief.customer) out.clientName = { value: brief.customer, sources: ["clickup"] };
  if (brief.description.trim()) out.notes = brief.description.trim();
  if (brief.dailyBudgetEuros) out.dailyBudgetEuros = { value: brief.dailyBudgetEuros, sources: ["clickup"] };
  if (brief.spendCapEuros) out.spendCapEuros = { value: brief.spendCapEuros, sources: ["clickup"] };

  // Das Feld vor allem anderen: es ist die ausdrückliche Angabe. Dann die
  // Beschreibung (unten, per Mistral), dann der Name – der trägt die Rollen
  // nur, wenn er nach der Konvention gebaut ist. Die Aufgabe insgesamt vor der
  // Onboarding-Tabelle: wer die Aufgabe schreibt, weiß, was diesmal gesucht
  // wird; die Tabelle sagt, was der Kunde grundsätzlich sucht.
  const fromField = brief.rolesText ? parseRoles(brief.rolesText) : { roles: [], free: "" };
  const roles = fromField.roles;
  if (roles.length) out.roles = { value: roles, sources: ["clickup"] };
  if (fromField.roles.length && fromField.free) out.roleFreeText = { value: fromField.free, sources: ["clickup"] };
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

  if (hint.locations?.length) out.locations = { value: hint.locations, sources: ["clickup"] };
  if (hint.formHint) out.formHint = { value: hint.formHint, sources: ["clickup"] };
  if (hint.radiusKm) out.radiusKm = { value: hint.radiusKm, sources: ["clickup"] };

  // Stellen: Feld → Beschreibung → Aufgabenname → Onboarding-Tabelle. Sagt
  // die Aufgabe irgendwo etwas, gilt nur das; die Tabelle nur, wenn sie schweigt.
  if (!hasRoles()) {
    const fromDescription = rolesFromTitles(hint.titles);
    const fromName = rolesFromTaskName(brief.name);
    const pick = fromDescription.roles.length || fromDescription.free ? fromDescription : { roles: fromName, free: "" };
    if (pick.roles.length) out.roles = { value: pick.roles, sources: ["clickup"] };
    if (pick.free) out.roleFreeText = { value: pick.free, sources: ["clickup"] };
  }

  if (sheet.folderId) out.driveFolderId = { value: sheet.folderId, sources: ["clickup"] };
  if (sheet.benefits.length) out.benefits = { value: sheet.benefits.join("\n"), sources: ["onboarding"] };
  if (!hasRoles()) {
    if (sheet.roles.length) out.roles = { value: sheet.roles, sources: ["onboarding"] };
    if (sheet.roleFreeText) out.roleFreeText = { value: sheet.roleFreeText, sources: ["onboarding"] };
  }

  // Fallback, nur wenn die Beschreibung keinen Ort hergab – ein Aufruf
  // weniger gegen ClickUp, und die Beschreibung ist ohnehin die genauere
  // Quelle (Adresse statt nur Ort im Kundenordner).
  let overview: CampaignEvidence["overview"] = {};
  if (!out.locations && brief.folderId) {
    emit({ type: "step", step: "overview", status: "running" });
    try {
      overview = await deps.customerOverview(brief.folderId);
      if (overview.address) out.locations = { value: [overview.address], sources: ["clickup"] };
      if (overview.radiusKm && !out.radiusKm) out.radiusKm = { value: overview.radiusKm, sources: ["clickup"] };
      const roles = overview.rolesText ? parseRoles(overview.rolesText).roles : [];
      if (!hasRoles() && roles.length) out.roles = { value: roles, sources: ["clickup"] };
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

  // Bis hierher steht der deterministische Vorschlag: Aufgabe vor Onboarding.
  // Jetzt die Auflösung – sie darf jedes Feld ersetzen, für das sie eine
  // Quelle nennt; was sie weglässt, bleibt. Scheitert sie, bleibt alles.
  const evidence: CampaignEvidence = {
    task: {
      id: brief.taskId,
      name: brief.name,
      description: brief.description,
      rolesText: brief.rolesText,
      dailyBudgetEuros: brief.dailyBudgetEuros,
      spendCapEuros: brief.spendCapEuros,
      locations: hint.locations,
      formHint: hint.formHint,
      radiusKm: hint.radiusKm,
      jobs: hint.titles,
    },
    onboarding: { benefits: sheet.benefits, jobs: [...sheet.roles, ...(sheet.roleFreeText ? [sheet.roleFreeText] : [])] },
    overview,
    aiNotes,
  };
  // Nur die Aufgabe als Beleg – kein Onboarding, keine Kundenübersicht, kein
  // Hinweis: da gibt es nichts zu verbinden, und ein Aufruf könnte den Stand
  // der Aufgabe nur verfälschen. Also keiner.
  const beyondTask =
    Boolean(aiNotes.trim()) ||
    evidence.onboarding.benefits.length > 0 ||
    evidence.onboarding.jobs.length > 0 ||
    Object.values(overview).some(Boolean);
  if (!beyondTask) {
    emit({ type: "step", step: "context", status: "skipped", detail: "nur die Aufgabe – nichts zu verbinden" });
    return out;
  }
  emit({ type: "step", step: "context", status: "running" });
  try {
    const ctx = parseCampaignContext(await deps.mistral(contextPrompt(evidence), { temperature: 0 }));
    applyResolved(out, ctx, brief);
    const used = [...new Set(Object.values(ctx.sources).flat())];
    const fields = Object.keys(ctx.sources).length;
    emit({
      type: "step",
      step: "context",
      status: "done",
      // Die Quellen trägt das Etikett (sources) – die Zeile sagt, wie viel entschieden wurde.
      detail: fields ? `${fields} ${fields === 1 ? "Feld" : "Felder"} aufgelöst` : "nichts zu verbinden",
      sources: used,
    });
  } catch (e) {
    warnings.push(`Kampagnenkontext nicht aufgelöst – es gilt Aufgabe vor Onboarding: ${(e as Error).message}`);
    emit({ type: "step", step: "context", status: "failed", detail: (e as Error).message });
  }

  return out;
}

/**
 * Die aufgelösten Felder in den Brief – nur die mit Quelle. Ein leerer Wert
 * mit Quelle „user“ ist ein ausdrückliches Streichen („kein Ausgabenlimit“);
 * ein leerer Wert ohne „user“ heißt nur, dass das Modell nichts gesagt hat,
 * und der deterministische Wert bleibt.
 */
function applyResolved(out: AssembledBrief, ctx: ResolvedCampaignContext, brief: Brief): void {
  const s = ctx.sources;
  const cleared = (field: ContextField) => Boolean(s[field]?.includes("user"));
  if (s.roles) {
    if (ctx.roles.length || ctx.roleFreeText) {
      if (ctx.roles.length) out.roles = { value: ctx.roles, sources: s.roles };
      else delete out.roles;
      if (ctx.roleFreeText) out.roleFreeText = { value: ctx.roleFreeText, sources: s.roles };
      else delete out.roleFreeText;
    } else if (cleared("roles")) {
      delete out.roles;
      delete out.roleFreeText;
    }
  }
  if (s.locations && ctx.locations.length) out.locations = { value: ctx.locations, sources: s.locations };
  else if (cleared("locations")) delete out.locations;
  if (s.formHint && ctx.formHint) out.formHint = { value: ctx.formHint, sources: s.formHint };
  else if (cleared("formHint")) delete out.formHint;
  if (s.radiusKm && ctx.radiusKm) out.radiusKm = { value: ctx.radiusKm, sources: s.radiusKm };
  else if (cleared("radiusKm")) delete out.radiusKm;
  if (s.benefits && ctx.benefits.length) out.benefits = { value: ctx.benefits.join("\n"), sources: s.benefits };
  else if (cleared("benefits")) delete out.benefits;
  // Geld nur aus den Hinweisen: ein „anderes“ Budget mit Quelle clickup ist
  // ein verrechnetes Modell, nicht die Aufgabe – die Aufgabe steht ja hier.
  if (s.dailyBudgetEuros && ctx.dailyBudgetEuros) {
    if (cleared("dailyBudgetEuros") || ctx.dailyBudgetEuros === brief.dailyBudgetEuros)
      out.dailyBudgetEuros = { value: ctx.dailyBudgetEuros, sources: s.dailyBudgetEuros };
  } else if (cleared("dailyBudgetEuros")) delete out.dailyBudgetEuros;
  if (s.spendCapEuros && ctx.spendCapEuros) {
    if (cleared("spendCapEuros") || ctx.spendCapEuros === brief.spendCapEuros)
      out.spendCapEuros = { value: ctx.spendCapEuros, sources: s.spendCapEuros };
  } else if (cleared("spendCapEuros")) delete out.spendCapEuros;
  if (s.copyInstructions) out.copyInstructions = ctx.copyInstructions;
}
