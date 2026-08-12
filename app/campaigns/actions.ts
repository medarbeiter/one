"use server";

import { updateTag } from "next/cache";
import { setDailyBudget, setStatus } from "@/lib/campaigns";
import { launch, type LaunchInput, type Receipt } from "@/lib/launch";
import { verifyCampaign, type Check } from "@/lib/verify";
import { listCustomers } from "@/lib/customers";
import { listLeadForms, type LeadForm } from "@/lib/forms";
import { lastCampaignDefaults, type Prefill } from "@/lib/prefill";

export type LaunchResult = { ok?: string; error?: string };

export type WizardSubmission = Omit<LaunchInput, "adAccount" | "pageId"> & {
  customerId: string;
  adAccount?: string;
};

export type LaunchState = { receipt?: Receipt; checks?: Check[]; error?: string };

export async function launchAction(
  _prev: LaunchState,
  input: WizardSubmission,
): Promise<LaunchState> {
  // Konto und Seite kommen vom Kunden, nicht vom Client – sonst zeigt ein
  // manipuliertes Feld auf ein fremdes Werbekonto.
  const { customers } = await listCustomers();
  const customer = customers.find((c) => c.id === input.customerId);
  if (!customer?.page) return { error: "Pick a customer with a connected page." };
  const owned = customer.adAccounts.map((a) => a.id);
  const adAccount = input.adAccount ?? owned[0];
  if (!adAccount) return { error: `${customer.name} has no ad account assigned.` };
  // Ein Client-Feld darf nur auf ein Konto zeigen, das dem Kunden auch gehört –
  // sonst kann eine POST direkt auf ein fremdes Werbekonto zielen.
  if (!owned.includes(adAccount))
    return { error: "That ad account does not belong to the selected customer." };

  if (!input.adSets.length) return { error: "Add at least one ad set." };
  for (const s of input.adSets) {
    if (!s.videos.length) return { error: `“${s.name}” has no videos.` };
    if (!s.formId) return { error: `“${s.name}” has no lead form selected.` };
  }
  if (input.spendCapCents !== undefined && input.spendCapCents < 10000)
    return { error: "The spend cap must be at least 100 €." };

  let receipt: Receipt;
  try {
    receipt = await launch({ ...input, adAccount, pageId: customer.page.id });
    updateTag("campaigns");
  } catch (e) {
    return { error: (e as Error).message };
  }

  // Verifikation ist Best-Effort: die Kampagne existiert bei Meta bereits und
  // die Receipt ist der einzige Griff für den Retry-Pfad – ein Lesefehler
  // danach darf sie nicht verschlucken.
  if (!receipt.campaignId) return { receipt };
  try {
    const checks = await verifyCampaign(receipt.campaignId, {
      formIds: Object.fromEntries(input.adSets.map((s) => [s.name, s.formId])),
      radiusKm: Object.fromEntries(input.adSets.map((s) => [s.name, s.radiusKm])),
      adCount: input.adSets.reduce((n, s) => n + s.videos.length, 0),
    });
    return { receipt, checks };
  } catch (e) {
    return { receipt, error: (e as Error).message };
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
    return { ok: status === "ACTIVE" ? "Campaign is live." : "Campaign paused." };
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
export async function listFormsAction(pageId: string): Promise<FormsResult> {
  try {
    return { forms: await listLeadForms(pageId) };
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

export async function setBudgetAction(id: string, euros: number): Promise<LaunchResult> {
  if (!Number.isFinite(euros) || euros <= 0) return { error: "Daily budget must be above 0." };
  try {
    await setDailyBudget(id, Math.round(euros * 100));
    updateTag("campaigns");
    return { ok: "Daily budget updated." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
