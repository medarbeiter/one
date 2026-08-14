/**
 * Heuristiken für die Anzeigentexte – Hinweise, keine Sperren.
 *
 * Jede Regel hier ist an 1149 laufenden Creatives der Agentur gemessen und nicht
 * aus allgemeinen Copywriting-Ratschlägen abgeleitet. Das ist der Unterschied
 * zwischen einem Hinweis, der etwas bedeutet, und einem, den man wegklickt:
 *
 *   Kundenname im Fließtext       90 %  → Hinweis, wenn er fehlt
 *   Kundenname in der Überschrift 13 %  → *kein* Hinweis; die Mehrheit lässt ihn weg
 *   Handlungsaufruf im Fließtext  98 %  → Hinweis, wenn er fehlt
 *   doppelte Texte                 0 %  → Warnung
 *   Ort im Text                    1 %  → bewusst keine Regel, sonst Dauerfeuer
 *   Fließtexte                   p10 178, median 547 Zeichen
 *   Varianten je Creative        median 5 bodies, 5 titles
 *
 * Leere Felder und Dubletten nimmt Meta widerspruchslos an (gegen die API mit
 * validate_only geprüft) – deshalb fallen sie sonst niemandem auf und deshalb
 * stehen sie hier.
 *
 * Zur Länge der Überschriften: die erste Fassung meldete "eine Überschrift ist
 * länger als 40 Zeichen" und schlug damit bei 49 % der eigenen laufenden
 * Anzeigen an – die Schwelle stammte aus der Verteilung *einzelner*
 * Überschriften (p90 = 41), ein Creative hat aber fünf. Dass eine davon länger
 * ist, ist der Normalfall und keine Meldung wert. Aussagekräftig ist erst, wenn
 * *keine* kurz genug ist: je Creative liegt die kürzeste Überschrift im Median
 * bei 14 Zeichen, und dass alle über 40 liegen, kommt in 1 % der Fälle vor.
 */

export type NoticeLevel = "warn" | "info";
export type CopyField = "bodies" | "titles" | "description";
export type Notice = { level: NoticeLevel; field: CopyField; message: string };

/** Ab hier kürzt Meta die Überschrift in den meisten Platzierungen ab. */
export const HEADLINE_DISPLAY_LIMIT = 40;
/** So lang, dass sie überall abgeschnitten wird – kommt in 3 % der Fälle vor. */
export const HEADLINE_EXTREME = 60;
/** Deutlich unter dem 10. Perzentil der laufenden Fließtexte (178). */
export const SHORT_BODY_CHARS = 100;
/** Median sind 5; unter drei Varianten hat Meta kaum etwas zu rotieren. */
export const FEW_VARIANTS = 3;

const CTA_WORDS = [
  "bewirb",
  "bewerb",
  "jetzt",
  "melde dich",
  "meld dich",
  "klick",
  "schreib uns",
  "kontaktier",
];

/**
 * Wörter, die in fast jedem Namen dieser Branche stehen. Ohne diese Liste würde
 * "Pflegedienst" im Text als Nennung des Kunden durchgehen und die Regel wäre wertlos.
 */
const NAME_NOISE = new Set([
  "pflegedienst", "pflege", "pflegeteam", "gmbh", "ambulante", "ambulanter", "seniorenheim",
  "seniorenresidenz", "seniorenzentrum", "haus", "care", "team", "gbr", "kg", "mbh",
  "betreuung", "service", "gesundheit", "sozialstation", "residenz", "zentrum",
  "krankenpflege", "altenpflege", "gemeinnutzige", "gemeinnützige",
]);

export type CopyInput = {
  bodies: string[];
  titles: string[];
  description: string;
  /** Der beworbene Kunde. Fehlt er, entfällt die Namensregel. */
  business?: string;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const filled = (xs: string[]) => xs.filter((x) => x.trim());
const hasDuplicate = (xs: string[]) => new Set(xs.map(norm)).size < xs.length;

/** Die aussagekräftigen Wörter eines Kundennamens – "Herzhalt", nicht "Pflegedienst". */
export function nameTokens(business: string): string[] {
  return business
    .toLowerCase()
    .split(/[^a-zäöüß]+/)
    .filter((w) => w.length >= 4 && !NAME_NOISE.has(w));
}

const mentions = (texts: string[], tokens: string[]) =>
  texts.some((t) => tokens.some((w) => t.toLowerCase().includes(w)));

export function checkCopy(input: CopyInput): Notice[] {
  const notices: Notice[] = [];
  const bodies = filled(input.bodies);
  const titles = filled(input.titles);
  const description = input.description.trim();

  const warn = (field: CopyField, message: string) =>
    notices.push({ level: "warn", field, message });
  const info = (field: CopyField, message: string) =>
    notices.push({ level: "info", field, message });

  // --- Dubletten: in den laufenden Kampagnen praktisch nicht vorhanden.
  if (hasDuplicate(bodies))
    warn("bodies", "Zwei Primärtexte sind identisch — Meta würde denselben Text zweimal rotieren.");
  if (hasDuplicate(titles))
    warn("titles", "Zwei Überschriften sind identisch — Meta würde dieselbe Überschrift zweimal rotieren.");

  // --- Leere Felder zwischen gefüllten: Meta nimmt sie an und verschenkt den Platz.
  const emptyBodies = input.bodies.length - bodies.length;
  if (bodies.length && emptyBodies > 0)
    warn(
      "bodies",
      `${emptyBodies} Primärtextfeld(er) sind leer. Meta akzeptiert das und rotiert nichts in diesen Slot.`,
    );
  const emptyTitles = input.titles.length - titles.length;
  if (titles.length && emptyTitles > 0)
    warn(
      "titles",
      `${emptyTitles} Überschriftenfeld(er) sind leer. Meta akzeptiert das und rotiert nichts in diesen Slot.`,
    );

  // Ab hier nur prüfen, was schon geschrieben ist – ein frisches Formular
  // soll nicht mit Hinweisen begrüßen, die nur "du hast noch nichts getippt" heißen.
  if (bodies.length) {
    const tokens = input.business ? nameTokens(input.business) : [];
    if (tokens.length && !mentions(bodies, tokens))
      info(
        "bodies",
        `Kein Primärtext erwähnt „${input.business}“. 90 % deiner laufenden Anzeigen nennen den Kunden im Fließtext.`,
      );

    if (!mentions(bodies, CTA_WORDS))
      info(
        "bodies",
        "Kein Primärtext fordert zur Bewerbung auf. 98 % deiner laufenden Anzeigen tun das („Jetzt bewerben“, „Melde dich“).",
      );

    const shortest = Math.min(...bodies.map((b) => b.trim().length));
    if (shortest < SHORT_BODY_CHARS)
      info(
        "bodies",
        `Ein Primärtext hat nur ${shortest} Zeichen. Deine laufenden Anzeigen liegen mindestens bei 178, typisch bei 547.`,
      );

    if (bodies.length < FEW_VARIANTS)
      info(
        "bodies",
        `Nur ${bodies.length} Primärtext(e). Meta rotiert bis zu 5, und deine laufenden Kampagnen nutzen 5.`,
      );
  }

  if (titles.length) {
    const lengths = titles.map((t) => t.trim().length);

    // Nicht "eine ist lang" – das ist der Normalfall –, sondern "keine ist kurz".
    if (Math.min(...lengths) > HEADLINE_DISPLAY_LIMIT)
      info(
        "titles",
        `Jede Überschrift ist über ${HEADLINE_DISPLAY_LIMIT} Zeichen lang, keine überlebt Metas Kürzung. Deine laufenden Kampagnen behalten mindestens eine kurze — 14 Zeichen ist typisch.`,
      );

    const longest = Math.max(...lengths);
    if (longest > HEADLINE_EXTREME)
      info(
        "titles",
        `Eine Überschrift hat ${longest} Zeichen — die wird in jeder Platzierung abgeschnitten.`,
      );

    if (titles.length < FEW_VARIANTS)
      info(
        "titles",
        `Nur ${titles.length} Überschrift(en). Meta rotiert bis zu 5, und deine laufenden Kampagnen nutzen 5.`,
      );
  }

  // Nur ansprechen, wenn sonst schon etwas steht – sonst ist es bloß "leeres Formular".
  if (!description && (bodies.length || titles.length))
    info("description", "Keine Beschreibung. Fast jede laufende Anzeige hat eine — sie steht unter der Überschrift.");

  return notices;
}
