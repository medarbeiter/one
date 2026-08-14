"use server";

import { updateTag } from "next/cache";
import { setDailyBudget, setStatus } from "@/lib/campaigns";
import type { Receipt } from "@/lib/launch";
import type { Check } from "@/lib/verify";
import { getLeadForm, listLeadForms, parseFormId, type LeadForm } from "@/lib/forms";
import { locationProblem, type GeoPlace } from "@/lib/geo";
import { estimateReach, searchPlaces, type Reach } from "@/lib/geo-search";
import { lastCampaignDefaults, type Prefill } from "@/lib/prefill";

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
export async function prefillAction(adAccount: string): Promise<Prefill | undefined> {
  try {
    return await lastCampaignDefaults(adAccount);
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
