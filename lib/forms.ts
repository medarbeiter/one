/**
 * Formulare werden in Meta gebaut, nicht hier – die bedingte Logik der Agentur
 * ist jedes Mal anders. Die App wählt nur aus und verlinkt zum Baukasten.
 */
import { graph, meta } from "./graph";

export type LeadForm = {
  id: string;
  name: string;
  status: string;
  locale?: string;
};

export async function listLeadForms(pageId: string): Promise<LeadForm[]> {
  const { data } = await graph<{ data: LeadForm[] }>(`${pageId}/leadgen_forms`, {
    params: { fields: "id,name,status,locale", limit: 100 },
    revalidate: 60,
    tags: ["forms", `forms:${pageId}`],
  });
  return (data ?? []).filter((f) => f.status !== "ARCHIVED");
}

export function instantFormsUrl(pageId: string): string {
  const url = new URL("https://business.facebook.com/latest/instant_forms");
  url.searchParams.set("asset_id", pageId);
  if (meta.business) url.searchParams.set("business_id", meta.business);
  return url.toString();
}
