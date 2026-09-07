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

/**
 * Der Weg zurück: aus einem Namen nach der Konvention wieder Firma und Rollen
 * lesen, damit eine duplizierte Kampagne ihre Rollen kennt und der neue Name
 * mit heutigem Datum entsteht. Altbestände ohne " - " und " ab " geben nichts
 * zurück – dann bleibt der Name, wie er ist, und die Rollen sind zu wählen.
 */
export function parseCampaignName(
  name: string,
): { business: string; roles: string[]; roleFreeText: string } | undefined {
  const m = /^(.+?) - (?:(.*?) )?ab \d{2}\.\d{2}\.\d{2,4}\b/.exec(name.trim());
  if (!m) return undefined;
  // Längste Kürzel zuerst, sonst nähme "PDL" dem "Stv. PDL" die Hälfte weg.
  const codes = [...ROLES.map((r) => r.code)].sort((a, b) => b.length - a.length);
  const roles: string[] = [];
  let rest = (m[2] ?? "").trim();
  for (;;) {
    const code = codes.find((c) => rest === c || rest.startsWith(`${c}/`) || rest.startsWith(`${c} `));
    if (!code) break;
    roles.push(code);
    rest = rest.slice(code.length).replace(/^\//, "").trim();
  }
  return { business: m[1].trim(), roles, roleFreeText: rest };
}

// Der erste heißt immer "Ads"; erst bei mehreren Standorten braucht er den Ort.
export function adSetName(index: number, city?: string): string {
  if (index === 0) return "Ads";
  return city ? `Ads – ${city}` : `Ads ${index + 1}`;
}

/**
 * Das Kürzel im Kampagnennamen kommt aus dem Namen der angemeldeten Person –
 * vorher aus einer festen Liste und dem localStorage, die bei jeder neuen
 * Kollegin nachzupflegen war. Erster und letzter Namensteil, denn
 * „Maria Anna Huber“ zeichnet als MH; ein einzelnes Wort gibt seine ersten
 * zwei Buchstaben. Wer anders zeichnet, ändert es im Assistenten unter Optional.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
