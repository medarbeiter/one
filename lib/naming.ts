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
 * Aus echten Kampagnennamen abgelesen und um die gängigen Pflege-Rollen
 * ergänzt. Kombinationen sind normal, deshalb ist die Auswahl mehrfach – und
 * der Freitext bleibt für Einzelfälle wie "Verwaltungskraft", die in kein
 * Kürzel passen. `code` steht im Kampagnennamen, `label` im UI.
 *
 * `prompt` ist die Fassung für die Textgenerierung, wo sie vom Label abweichen
 * muss: "Quereinsteiger" heißt für die KI, dass praktisch jede und jeder
 * angesprochen wird – ohne den Zusatz schriebe sie Texte für eine Fachrolle.
 */
export const ROLES: readonly { code: string; label: string; prompt?: string }[] = [
  { code: "FK", label: "Fachkräfte" },
  { code: "HK", label: "Hilfskräfte" },
  { code: "PFK", label: "Pflegefachkraft" },
  { code: "PDL", label: "Pflegedienstleitung" },
  { code: "Stv. PDL", label: "Stv. Pflegedienstleitung" },
  { code: "MA", label: "Mitarbeiter" },
  { code: "PA", label: "Pflegeassistenz" },
  { code: "PH", label: "Pflegehelfer" },
  {
    code: "QE",
    label: "Quereinsteiger",
    prompt:
      "Quereinsteiger – gesucht wird praktisch jede und jeder, keine Ausbildung oder Pflege-Erfahrung nötig",
  },
  { code: "BK", label: "Betreuungskraft" },
  { code: "HW", label: "Hauswirtschaftskraft" },
  { code: "Koch", label: "Koch" },
];

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
