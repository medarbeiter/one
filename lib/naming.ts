/**
 * Kampagnennamen folgen einer festen Konvention der Agentur:
 * "Firma - Rollen ab TT.MM.JJ XX (via One)". Der Zusatz "(via One)" markiert,
 * was über diese App entstanden ist – die Altbestände heißen uneinheitlich.
 */
export type NameParts = {
  business: string;
  roles: string[];
  roleFreeText?: string;
  start: Date;
  initials: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export const formatDate = (d: Date) =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

/**
 * Aus echten Kampagnennamen abgelesen. Kombinationen sind normal, deshalb ist
 * die Auswahl mehrfach – und der Freitext bleibt, weil es Einzelfälle wie
 * "Koch" oder "Verwaltungskraft" gibt, die in kein Kürzel passen.
 * ponytail: Die Langtexte sind Vermutung außer FK und HK; sie stehen nur im UI,
 * nicht im Kampagnennamen, und sind hier in einer Zeile korrigierbar.
 */
export const ROLES = [
  { code: "FK", label: "Fachkräfte" },
  { code: "HK", label: "Hilfskräfte" },
  { code: "PFK", label: "Pflegefachkraft" },
  { code: "PDL", label: "Pflegedienstleitung" },
  { code: "MA", label: "Mitarbeiter" },
  { code: "PA", label: "Pflegeassistenz" },
  { code: "PH", label: "Pflegehelfer" },
] as const;

/**
 * Initialen sind pro Person, nicht pro Installation – eine einzelne
 * Umgebungsvariable wäre falsch. Aus 148 echten Kampagnennamen abgelesen;
 * der Picker fällt für alle anderen auf Freitext zurück.
 */
export const KNOWN_INITIALS = ["KF", "MH", "PW"] as const;

// Zweistelliges Jahr – formatDate bleibt vierstellig, das braucht die Anzeige.
const shortDate = (d: Date) =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;

export function campaignName(p: NameParts): string {
  const what = [p.roles.join("/"), p.roleFreeText?.trim()]
    .filter(Boolean)
    .join(" ");
  // Teile statt feste Lücken zusammensetzen – sonst hinterlässt ein leeres
  // Feld (keine Rolle, keine Initialen) eine doppelte Lücke im Namen.
  return [p.business, "-", what, "ab", shortDate(p.start), p.initials, "(via One)"]
    .filter(Boolean)
    .join(" ");
}

// Der erste heißt immer "Ads"; erst bei mehreren Standorten braucht er den Ort.
export function adSetName(index: number, city?: string): string {
  if (index === 0) return "Ads";
  return city ? `Ads – ${city}` : `Ads ${index + 1}`;
}
