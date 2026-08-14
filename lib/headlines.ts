/**
 * Vorschläge für die Überschriften – Vorlagen, kein Modell.
 *
 * Die Zeilen sind an denselben laufenden Creatives abgelesen wie die Regeln in
 * lib/copy.ts und halten sich an deren Befunde: kurz (die kürzeste Überschrift
 * je Creative liegt im Median bei 14 Zeichen), und der Kundenname steht nur in
 * einem Teil davon – 13 % der laufenden Anzeigen nennen ihn in der Überschrift,
 * eine Liste, in der er überall stünde, bildete das Gegenteil ab.
 *
 * Reihenfolge ist Absicht: erst die Rolle, dann der Kunde, dann das Allgemeine.
 * Ausgewählt werden am Ende fünf – was hinten steht, sieht kaum jemand, also
 * steht vorn, was zu dieser Kampagne und keiner anderen passt.
 *
 * Reine Logik, kein React, kein Netz – deshalb ohne Graph testbar.
 */

import { HEADLINE_DISPLAY_LIMIT } from "./copy";
import { ROLES } from "./naming";

/** So viele Vorschläge stehen im Dialog. */
export const HEADLINE_SUGGESTIONS = 20;

export type HeadlineInput = {
  /** Der beworbene Kunde. Leer heißt: die Vorlagen mit Namen entfallen. */
  business: string;
  /** Rollenkürzel aus Schritt 3 (ROLES in lib/naming.ts). Leer ist erlaubt. */
  roles: string[];
  /** Die Rolle, die in kein Kürzel passt – zählt, wenn keins gewählt ist. */
  roleFreeText?: string;
};

const ROLE_TEMPLATES = [
  "{role} (m/w/d) gesucht",
  "Neuer Job als {role}?",
  "{role}? Wir suchen dich",
  "{role} mit Herz gesucht",
  "Als {role} zu uns wechseln",
  "{role} (m/w/d) — jetzt bewerben",
];

const NAME_TEMPLATES = [
  "{business} sucht dich",
  "Du + {business} = Gutes Team",
  "{business} stellt ein",
  "Neu bei {business}?",
  "Dein Platz bei {business}",
  "{business} sucht Verstärkung",
];

/**
 * Zwanzig, damit auch die kahlste Eingabe – kein Kunde gewählt, keine Rolle
 * angekreuzt – eine volle Auswahl ergibt und nicht fünf müde Zeilen.
 */
const NEUTRAL_TEMPLATES = [
  "Wir suchen dich",
  "Dein neuer Job wartet",
  "Neuer Job, neues Team",
  "Komm in unser Team",
  "Du + gutes Team = passt",
  "Bereit für etwas Neues?",
  "Endlich ein Team, das passt",
  "Bewerben dauert 2 Minuten",
  "Vollzeit oder Teilzeit?",
  "Job mit Herz gesucht?",
  "Wechseln lohnt sich",
  "Mehr Zeit für Menschen",
  "Dein Können ist gefragt",
  "Wir freuen uns auf dich",
  "Neuer Job in deiner Nähe",
  "Wir suchen Verstärkung",
  "Zeit für einen Tapetenwechsel?",
  "Arbeiten, wo du wohnst",
  "Lust auf ein neues Team?",
  "Deine Bewerbung, ganz einfach",
];

/**
 * Wie viele Überschriften noch Platz haben. Leere Felder zählen nicht als
 * belegt – das frische Formular hat eines und trotzdem fünf freie Plätze.
 */
export const freeTitleSlots = (titles: string[], max: number): number =>
  Math.max(0, max - titles.filter((t) => t.trim()).length);

/**
 * Ausgewählte Vorschläge in die Liste einsetzen: erst in die leeren Felder,
 * dann hinten an. Andersherum entstünden Lücken zwischen gefüllten Feldern –
 * die nimmt Meta widerspruchslos an und rotiert nichts in diesen Slot
 * (lib/copy.ts meldet sie deshalb).
 */
export function fillTitles(titles: string[], picked: string[], max: number): string[] {
  const next = [...titles];
  const queue = [...picked];
  for (let i = 0; i < next.length && queue.length; i++) {
    if (!next[i].trim()) next[i] = queue.shift()!;
  }
  while (queue.length && next.length < max) next.push(queue.shift()!);
  return next;
}

/** „PFK“ → „Pflegefachkraft“. Mehrere Kreuze: das erste zählt, sonst würde jede
 *  Vorlage sechsmal dastehen und die Auswahl wäre voll davon. */
export function roleWord(roles: string[], roleFreeText?: string): string | undefined {
  const label = roles.map((code) => ROLES.find((r) => r.code === code)?.label).find(Boolean);
  return label ?? (roleFreeText?.trim() || undefined);
}

/**
 * Was zu lang ist, fällt weg statt abgeschnitten zu werden: bei einem Kunden
 * wie „Häusliche Krankenpflege Schölzke GmbH“ verschwinden damit alle Vorlagen
 * mit Namen – und das ist die richtige Antwort, denn keine davon wäre in Metas
 * Platzierungen je vollständig zu lesen.
 */
export function generateHeadlines({ business, roles, roleFreeText }: HeadlineInput): string[] {
  const role = roleWord(roles, roleFreeText);
  const name = business.trim();
  const candidates = [
    ...(role ? ROLE_TEMPLATES.map((t) => t.replace("{role}", role)) : []),
    ...(name ? NAME_TEMPLATES.map((t) => t.replace("{business}", name)) : []),
    ...NEUTRAL_TEMPLATES,
  ];

  const out: string[] = [];
  for (const title of candidates) {
    if (title.length > HEADLINE_DISPLAY_LIMIT || out.includes(title)) continue;
    out.push(title);
    if (out.length === HEADLINE_SUGGESTIONS) break;
  }
  return out;
}
