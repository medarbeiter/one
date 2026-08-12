"use server";

import { updateTag } from "next/cache";
import { launch, setDailyBudget, setStatus } from "@/lib/campaigns";
import { listCustomers } from "@/lib/customers";

export type LaunchResult = { ok?: string; error?: string };

export async function launchAction(
  _prev: LaunchResult,
  fd: FormData,
): Promise<LaunchResult> {
  const files = fd
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Pick at least one image or video." };

  const s = (k: string) => String(fd.get(k) ?? "").trim();

  // Konto und Seite kommen vom Kunden, nicht von versteckten Feldern –
  // die dürften sonst gegen ein fremdes Konto zeigen.
  const { customers } = await listCustomers();
  const customer = customers.find((c) => c.id === s("customer"));
  if (!customer?.page) return { error: "Pick a customer with a connected page." };
  const adAccount = s("adAccount") || customer.adAccounts[0]?.id;
  if (!adAccount) return { error: `${customer.name} has no ad account assigned.` };

  try {
    const r = await launch({
      adAccount,
      pageId: customer.page.id,
      name: s("name"),
      objective: s("objective"),
      dailyBudgetCents: Math.round(Number(fd.get("dailyBudget")) * 100),
      optimizationGoal: s("optimizationGoal"),
      billingEvent: "IMPRESSIONS",
      specialAdCategories: fd.getAll("specialAdCategories").map(String),
      countries: s("countries")
        .split(",")
        .map((c) => c.trim().toUpperCase()),
      ageMin: Number(fd.get("ageMin")),
      ageMax: Number(fd.get("ageMax")),
      link: s("link"),
      message: s("message"),
      headline: s("headline"),
      callToAction: s("callToAction"),
      files,
    });
    updateTag("campaigns");
    return { ok: `Created campaign ${r.campaignId} with ${r.adIds.length} ad(s) — paused.` };
  } catch (e) {
    return { error: (e as Error).message };
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
