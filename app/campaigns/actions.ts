"use server";

import { updateTag } from "next/cache";
import { graph } from "@/lib/graph";
import { adsManagerUrl, setDailyBudget, setStatus } from "@/lib/campaigns";
import type { Receipt } from "@/lib/launch";
import type { Check } from "@/lib/verify";
import { getLeadForm, listLeadForms, parseFormId, type LeadForm } from "@/lib/forms";
import { locationProblem, type GeoPlace } from "@/lib/geo";
import { estimateReach, fitReachRadius, searchPlaces, type FittedRadius, type Reach } from "@/lib/geo-search";
import { lastCampaignDefaults, type Prefill } from "@/lib/prefill";
import { generateBody, generateDescription, generateTitles, type BodiesInput } from "@/lib/bodies";
import { closeBrief, customerOverview, getBrief, listOpenBriefs, type Brief } from "@/lib/clickup";
import { buildFormSpec, nextVersion, type FormSpec } from "@/lib/form-spec";
import { suggestQuestions } from "@/lib/form-questions";
import { findPrivacyUrl, normalizeWebsite } from "@/lib/privacy-url";
import { exportCsv, findSheet } from "@/lib/drive";

export type LaunchResult = { ok?: string; error?: string };

export type { WizardSubmission } from "@/lib/launch-request";

export type LaunchState = { receipt?: Receipt; checks?: Check[]; error?: string };

/**
 * Das Anlegen selbst läuft über app/api/launch – ein Route Handler, weil eine
 * Server Action erst am Ende antwortet und dort eine Minute lang nichts zu
 * sehen wäre. Nur den Cache kann der Handler nicht anfassen: updateTag() gibt
 * es ausschließlich in Server Actions. Ohne diesen Aufruf danach stünde die
 * frisch angelegte Kampagne bis zu 60 Sekunden nicht in der Tabelle.
 */
export async function refreshCampaignsAction(): Promise<void> {
  updateTag("campaigns");
}

/**
 * Wirft die gecachte Portfolio-Kopie weg (listAssets, 5 Minuten). Der Wizard
 * ruft das beim Nachlesen der Lead-Bedingungen auf: ohne den Tag-Wurf
 * antwortete router.refresh() bis zu 5 Minuten mit demselben alten Stand.
 */
export async function refreshAssetsAction(): Promise<void> {
  updateTag("assets");
}

/**
 * Nur das eine Feld der einen Seite – die 30-s-Schleife im Wizard las vorher
 * bei jedem Tick das ganze Portfolio neu (Tag-Wurf + vier ungecachte
 * Graph-Aufrufe). Ein Fehler zählt als „noch nicht angenommen“: die Schleife
 * fragt in 30 s wieder, und die Meldung im Wizard bleibt bis dahin stehen.
 */
export async function leadgenTosAcceptedAction(pageId: string): Promise<boolean> {
  try {
    const page = await graph<{ leadgen_tos_accepted?: boolean }>(pageId, {
      params: { fields: "leadgen_tos_accepted" },
    });
    return page.leadgen_tos_accepted === true;
  } catch {
    return false;
  }
}

export async function setStatusAction(
  id: string,
  status: "ACTIVE" | "PAUSED",
): Promise<LaunchResult> {
  try {
    await setStatus(id, status);
    // updateTag statt revalidatePath: der Read direkt danach muss die neue
    // Zeile sehen, nicht die letzte gecachte – das ist Read-your-own-write.
    updateTag("campaigns");
    return { ok: status === "ACTIVE" ? "Kampagne ist live." : "Kampagne pausiert." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export type FormsResult = { forms: LeadForm[]; error?: string };

// listLeadForms braucht das Access-Token aus process.env – im Browser gibt es
// das nicht, deshalb der Umweg über eine Server Action. Der Fehler wird hier
// gefangen statt geworfen: eine geworfene Server Action liefert dem Client in
// Produktion nur eine generische Meldung, aber genau der Text von Meta
// ("(#10) User has insufficient privileges…") ist es, den die Person sehen muss.
export async function listFormsAction(pageId: string, refresh = false): Promise<FormsResult> {
  try {
    // Der Aktualisieren-Knopf muss den Cache anfassen, nicht nur neu rendern:
    // sonst antwortet der Datei-Cache bis zu 60 Sekunden lang mit derselben
    // Liste, in der das gerade gebaute Formular eben fehlt. updateTag wirft die
    // gecachte Kopie weg, `fresh` holt für diesen Klick ungecacht.
    if (refresh) updateTag(`forms:${pageId}`);
    return { forms: await listLeadForms(pageId, refresh) };
  } catch (e) {
    return { forms: [], error: (e as Error).message };
  }
}

/**
 * Der Notausgang zur Liste: manche frisch in Meta gebauten Formulare tauchen
 * dort minutenlang nicht auf (und über 100 Formulare passen ohnehin nicht in
 * eine Antwort). Mit der ID aus dem Baukasten kommt das Formular direkt.
 */
export type FormSuggestInput = {
  pageId: string;
  /** Der beworbene Kunde – für den Datenschutz-Linktext. */
  business: string;
  taskId?: string;
  roles: string[];
  roleFreeText?: string;
  initials: string;
  city: string;
  benefits?: string;
  notes?: string;
  instructions?: string;
  /** Der Drive-Ordner des Kunden – die Onboarding-Tabelle darin liefert die Voraussetzungen. */
  driveFolderId?: string;
  /** Von Hand eingetragen, wenn die Kundenübersicht keine kennt. */
  website?: string;
};

export type FormSuggestResult = { spec?: FormSpec; warnings: string[]; error?: string };

/**
 * Die Vorlage für ein neues Lead-Formular: Fragen von Mistral, Website aus
 * der Kundenübersicht, Datenschutz-Link von der Website, Version aus der
 * Formularliste der Seite. Alles Weitere ist Regel (lib/form-spec.ts).
 * Gebaut wird es nicht hier, sondern von der Erweiterung im Baukasten.
 */
export async function suggestFormAction(input: FormSuggestInput): Promise<FormSuggestResult> {
  const warnings: string[] = [];
  try {
    const onboardingCsv = input.driveFolderId
      ? await findSheet(input.driveFolderId)
          .then((sheet) => (sheet ? exportCsv(sheet.id) : ""))
          .catch((e: Error) => {
            warnings.push(`Onboarding-Tabelle nicht lesbar – Fragen ohne Voraussetzungen: ${e.message}`);
            return "";
          })
      : "";
    const [questions, names, website] = await Promise.all([
      suggestQuestions({ ...input, onboardingCsv }),
      listLeadForms(input.pageId).then((fs) => fs.map((f) => f.name)).catch((e: Error) => {
        warnings.push(`Formularliste nicht lesbar – Version v1 angenommen: ${e.message}`);
        return [] as string[];
      }),
      input.website?.trim()
        ? normalizeWebsite(input.website)
        : websiteFromTask(input.taskId).catch((e: Error) => {
            warnings.push(`Website nicht aus der Kundenübersicht lesbar: ${e.message}`);
            return "";
          }),
    ]);
    if (!website) warnings.push("Keine Website gefunden – bitte eintragen.");
    const privacyUrl = website ? await findPrivacyUrl(website) : "";
    if (website && privacyUrl === website) warnings.push("Kein Datenschutz-Link auf der Website gefunden – die Website selbst steht drin.");
    return {
      warnings,
      spec: buildFormSpec({
        business: input.business,
        roles: input.roles,
        roleFreeText: input.roleFreeText,
        version: nextVersion(names, input.roles, input.roleFreeText, input.initials),
        initials: input.initials,
        city: input.city,
        questions,
        privacyUrl,
        website,
      }),
    };
  } catch (e) {
    return { warnings, error: (e as Error).message };
  }
}

async function websiteFromTask(taskId?: string): Promise<string> {
  if (!taskId) return "";
  const { folderId } = await getBrief(taskId);
  if (!folderId) return "";
  return normalizeWebsite((await customerOverview(folderId)).website);
}

export async function pullFormAction(pageId: string, input: string): Promise<FormsResult> {
  const formId = parseFormId(input);
  if (!formId)
    return {
      forms: [],
      error: "Das ist keine Formular-ID. Erwartet wird die Zahl aus Meta, z. B. 1234567890123456.",
    };
  try {
    const form = await getLeadForm(pageId, formId);
    // Archiviert nimmt Meta beim Anlegen nicht an – lieber hier sagen als in
    // der Fehlermeldung einer halb angelegten Kampagne.
    if (form.status === "ARCHIVED")
      return { forms: [], error: `„${form.name}“ ist in Meta archiviert und kann nicht beworben werden.` };
    return { forms: [form] };
  } catch (e) {
    return { forms: [], error: (e as Error).message };
  }
}

// lastCampaignDefaults braucht das Access-Token aus process.env – deshalb der
// gleiche Server-Action-Umweg wie bei listFormsAction. Anders als dort ist ein
// Lesefehler hier egal genug, um still zu verschlucken: Vorbelegung ist eine
// Erleichterung, ihr Fehlen darf den Assistenten nicht blockieren oder mit
// einer Fehlermeldung stören, die niemand angefordert hat.
export async function prefillAction(adAccount: string, pageId: string): Promise<Prefill | undefined> {
  try {
    return await lastCampaignDefaults(adAccount, pageId);
  } catch {
    return undefined;
  }
}

/**
 * Ortssuche für das Standortfeld. Ein Fehler kommt hier als leere Liste zurück
 * statt als Meldung: die Suche läuft beim Tippen, und ein hängengebliebener
 * Netzfehler von vor drei Buchstaben hilft niemandem. Wer keine Treffer findet,
 * tippt weiter eine Adresse – das Feld nimmt beides.
 */
export async function searchPlacesAction(q: string): Promise<GeoPlace[]> {
  try {
    return await searchPlaces(q);
  } catch {
    return [];
  }
}

/**
 * Wie groß die Zielgruppe wäre. Der Fehlerfall kommt hier ausdrücklich als Text
 * zurück, nicht still: die Zahl steht am Formular und ihr Fehlen sähe sonst aus
 * wie "0 Menschen im Umkreis".
 */
/**
 * Der Assistent wählt den Umkreis selbst: ab dem gegebenen Radius die Leiter
 * hinauf, bis mindestens 150 000 Menschen erreicht sind (lib/geo-search.ts).
 * Serverseitig in einem Aufruf – bis zu acht Schätzungen gegen Meta, die der
 * Browser sonst einzeln abwarten müsste.
 */
export async function fitRadiusAction(
  adAccount: string,
  location: { addressString: string; radiusKm: number; place?: GeoPlace },
): Promise<FittedRadius | { error: string }> {
  const problem = locationProblem(location);
  if (problem) return { error: problem };
  try {
    return await fitReachRadius(
      (radiusKm) => estimateReach(adAccount, { ...location, radiusKm }),
      location.radiusKm,
    );
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function reachAction(
  adAccount: string,
  location: { addressString: string; radiusKm: number; place?: GeoPlace },
): Promise<Reach | { error: string }> {
  const problem = locationProblem(location);
  if (problem) return { error: problem };
  try {
    return await estimateReach(adAccount, location);
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Der Mistral-Key liegt in process.env – gleicher Server-Action-Umweg wie bei
// listFormsAction, und der Fehlertext (Quota, ungültiger Key) muss beim
// Bediener ankommen statt als generische Produktionsmeldung. Ein Aufruf je
// Vorlage: der Dialog feuert fünf parallel und füllt jeden Slot, sobald
// seiner fertig ist.
export async function generateBodyAction(
  input: BodiesInput,
  template: number,
): Promise<{ body?: string; error?: string }> {
  try {
    return { body: await generateBody(input, template) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** KI-Überschriften für den Überschriften-Dialog – kurz und Meta-gekürzt gedacht. */
export async function generateTitlesAction(
  input: BodiesInput,
): Promise<{ titles: string[]; error?: string }> {
  try {
    return { titles: await generateTitles(input) };
  } catch (e) {
    return { titles: [], error: (e as Error).message };
  }
}

/** Die Beschreibung – Benefits als ✅-Liste. */
export async function generateDescriptionAction(
  input: BodiesInput,
): Promise<{ description?: string; error?: string }> {
  try {
    return { description: await generateDescription(input) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setBudgetAction(id: string, euros: number): Promise<LaunchResult> {
  if (!Number.isFinite(euros) || euros <= 0) return { error: "Tagesbudget muss über 0 liegen." };
  try {
    await setDailyBudget(id, Math.round(euros * 100));
    updateTag("campaigns");
    return { ok: "Tagesbudget aktualisiert." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Derselbe Umweg wie bei den Mistral-Aktionen: das ClickUp-Token liegt in
// process.env, und der Fehlertext (Token abgelaufen, kein Zugriff auf die
// Liste) muss beim Bediener ankommen statt als generische Produktionsmeldung.
export async function briefsAction(): Promise<{ briefs: Brief[]; error?: string }> {
  try {
    return { briefs: await listOpenBriefs() };
  } catch (e) {
    return { briefs: [], error: (e as Error).message };
  }
}

// Ads Manager erwartet die Konto-ID ohne "act_" – dieselbe Adresse wie in receipt.tsx.
/**
 * Nach dem Anlegen: Aufgabe umbenannt in den Kampagnennamen, auf „abnahme kampagne“, Kommentar mit Name und
 * Link. Ein Fehler hier ist eine Zeile in der Quittung – die Kampagne steht.
 */
export async function closeBriefAction(
  taskId: string,
  campaignName: string,
  adAccount: string,
  campaignId: string,
): Promise<{ error?: string }> {
  try {
    await closeBrief(
      taskId,
      campaignName,
      `Kampagne über One angelegt (pausiert): ${campaignName}\n${adsManagerUrl(adAccount, campaignId)}`,
    );
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}
