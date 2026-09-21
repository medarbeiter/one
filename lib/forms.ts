/**
 * Formulare werden in Meta gebaut, nicht hier – die bedingte Logik der Agentur
 * ist jedes Mal anders. Die App wählt nur aus und verlinkt zum Baukasten.
 */
import { fuzzyCustomerMatch } from "./customers";
import type { FormQuestion } from "./form-spec";
import { graph, meta } from "./graph";

export type LeadForm = {
  id: string;
  name: string;
  status: string;
  locale?: string;
};

const FIELDS = "id,name,status,locale";

/**
 * `fresh` umgeht den Datei-Cache: mit revalidate: 60 lieferte auch der
 * Aktualisieren-Knopf bis zu eine Minute lang genau die Liste zurück, wegen der
 * er geklickt wurde – ein gerade in Meta gebautes Formular fehlte darin.
 */
export async function listLeadForms(pageId: string, fresh = false): Promise<LeadForm[]> {
  const { data } = await graph<{ data: LeadForm[] }>(`${pageId}/leadgen_forms`, {
    params: { fields: FIELDS, limit: 100 },
    asPage: pageId,
    ...(fresh ? {} : { revalidate: 60, tags: ["forms", `forms:${pageId}`] }),
  });
  return (data ?? []).filter((f) => f.status !== "ARCHIVED");
}

/**
 * Ein einzelnes Formular über seine ID. Gefragt wird mit dem Seiten-Token –
 * damit prüft Graph die Zugehörigkeit gleich mit: die ID einer fremden Seite
 * beantwortet es gar nicht erst, statt sie in eine Anzeige wandern zu lassen,
 * die Meta erst beim Anlegen ablehnt.
 */
export async function getLeadForm(pageId: string, formId: string): Promise<LeadForm> {
  return graph<LeadForm>(formId, { params: { fields: FIELDS }, asPage: pageId });
}

/**
 * Was aus Meta kopiert wird, ist mal die nackte ID, mal die halbe Adresszeile
 * des Baukastens. Bei mehreren Zahlenketten ohne Namen wird nicht geraten:
 * die falsche ID fällt sonst erst beim Anlegen auf.
 */
export function parseFormId(input: string): string | undefined {
  const text = input.trim();
  if (/^\d+$/.test(text)) return text;
  // In der URL des Baukastens ist asset_id die Seite – nur der benannte
  // Formular-Parameter zählt.
  const named = text.match(/[?&](?:form_id|formID|id)=(\d+)/)?.[1];
  if (named) return named;
  const runs = text.match(/\d{6,}/g);
  return runs?.length === 1 ? runs[0] : undefined;
}

export function instantFormsUrl(pageId: string): string {
  const url = new URL("https://business.facebook.com/latest/instant_forms");
  url.searchParams.set("asset_id", pageId);
  if (meta.business) url.searchParams.set("business_id", meta.business);
  return url.toString();
}

/**
 * Formulare entstehen im Baukasten, in einem anderen Tab. Dieser hier merkt
 * sich, welche IDs die Seite beim Öffnen hatte, und liest nach – das erste
 * Formular, das vorher nicht da war, ist das gerade gebaute.
 */
export function newlyAppeared(before: ReadonlySet<string>, now: LeadForm[]): LeadForm | undefined {
  return now.find((f) => !before.has(f.id));
}

/**
 * „Renningen Formular auswählen" aus der Aufgabe: das Formular, dessen Name
 * den Hinweis trägt – aber nur bei genau einem Treffer. Zwei sind eine Wahl,
 * und die trifft der Assistent nicht.
 */
export function matchFormHint(forms: LeadForm[], hint: string): LeadForm | undefined {
  const hits = forms.filter((f) => fuzzyCustomerMatch(f.name, hint));
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * Ein bestehendes Formular als Vorlage: Fragen, Freitexte, Website und
 * Datenschutz-Link, wie Meta sie zurückgibt.
 *
 * Was hier fehlt, fehlt bei Meta: die bedingte Logik („Nein“ → Formular
 * schließen) steht in keinem lesbaren Feld. Die Fragen kommen deshalb ohne
 * Antwortwege zurück; der Baukasten zeigt sie als offene Punkte an, statt
 * stillschweigend jede Antwort durchzulassen.
 */
export type FormDetail = LeadForm & {
  questions: FormQuestion[];
  freeText: string[];
  website: string;
  privacyUrl: string;
};

type GraphQuestion = {
  type?: string;
  label?: string;
  options?: { value?: string; key?: string }[];
};

export async function getFormDetail(pageId: string, formId: string): Promise<FormDetail> {
  const form = await graph<
    LeadForm & {
      questions?: GraphQuestion[];
      thank_you_page?: { website_url?: string };
      privacy_policy?: { url?: string };
    }
  >(formId, {
    params: { fields: `${FIELDS},questions{type,label,options},thank_you_page{website_url},privacy_policy{url}` },
    asPage: pageId,
  });
  const questions: FormQuestion[] = [];
  const freeText: string[] = [];
  for (const q of form.questions ?? []) {
    // Name, Telefon und E-Mail sind eigene Feldtypen und stehen im Baukasten
    // fest – nur die selbst gestellten Fragen sind hier zu bearbeiten.
    if (q.type !== "CUSTOM") continue;
    const label = (q.label ?? "").trim();
    if (!label) continue;
    const options = (q.options ?? []).map((o) => (o.value ?? "").trim()).filter(Boolean);
    if (options.length >= 2) questions.push({ label, options, goto: {} });
    else freeText.push(label);
  }
  return {
    id: form.id,
    name: form.name,
    status: form.status,
    locale: form.locale,
    questions,
    freeText,
    website: form.thank_you_page?.website_url ?? "",
    privacyUrl: form.privacy_policy?.url ?? "",
  };
}
