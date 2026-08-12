"use server";

import { revalidatePath } from "next/cache";
import { launch } from "@/lib/meta";

export type LaunchResult = { ok?: string; error?: string };

export async function launchAction(
  _prev: LaunchResult,
  fd: FormData,
): Promise<LaunchResult> {
  const files = fd
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length)
    return { error: "Mindestens ein Video oder Bild auswählen." };

  const s = (k: string) => String(fd.get(k) ?? "").trim();
  try {
    const r = await launch({
      adAccount: s("adAccount"),
      pageId: s("pageId"),
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
    revalidatePath("/campaigns");
    return {
      ok: `Kampagne ${r.campaignId} mit ${r.adIds.length} Anzeige(n) angelegt – pausiert.`,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
