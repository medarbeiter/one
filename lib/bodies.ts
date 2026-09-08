/**
 * Anzeigentexte per Mistral: Primärtexte, Überschriften und Beschreibung.
 * Die Primärtext-Vorlagen unten stammen aus einer echten Kampagne (AWO
 * Greiz); das Modell füllt die Platzhalter mit den Kampagnendaten und
 * schreibt die gefüllten Beispiele auf den neuen Kunden um.
 *
 * Ein Aufruf je Vorlage, nicht alle fünf in einem: die Texte sind unabhängig,
 * und fünf kurze Antworten trudeln einzeln ein statt als eine lange – der
 * Dialog füllt jeden Slot, sobald seiner fertig ist.
 *
 * Läuft nur auf dem Server – der Key steht in process.env.MISTRAL_API_KEY.
 */

import { ROLES } from "./naming";

export type BodiesInput = {
  /** Der beworbene Kunde – steht namentlich in den Texten. */
  business: string;
  /** Rollenkürzel aus Schritt 3 (ROLES in lib/naming.ts). */
  roles: string[];
  /** Die Rolle, die in kein Kürzel passt. */
  roleFreeText?: string;
  /** Ort aus dem Standortfeld – Stadt oder Adresse der Anzeigengruppe. */
  place?: string;
  /** Benefits des Arbeitgebers, von Hand eingetragen – stehen in keiner API. */
  benefits: string;
  /**
   * Der Kampagnenkontext: Stil-, Ton- und Ausschlusswünsche aus den Hinweisen
   * (copyInstructions) plus die Hinweise selbst. Gehen in jeden der drei
   * Prompts als derselbe Block – die Sicherheitsregeln der Prompts heben sie
   * nicht auf.
   */
  instructions?: string;
};

// Dieselben Sprachregeln für Primärtexte, Überschriften und Beschreibung.
const COPY_LANGUAGE = `Arbeitgebername: Verwende den natürlichen, öffentlich verständlichen Einrichtungsnamen statt des vollständigen Firmennamens. Entferne Rechtsformen (GmbH, gGmbH, e.V., GmbH & Co. KG usw.) und reine Betreiberzusätze; erhalte erkennbare Marken und den eigentlichen Einrichtungsnamen. Beispiel: „Seniorenstift am Obermain STE GmbH“ wird „Seniorenstift am Obermain“. Streiche nicht pauschal Großbuchstaben: Marken wie AWO oder DRK bleiben erhalten. Passe Artikel, Pronomen und Präpositionen sowie Genus und Kasus an den gekürzten Namen an: „das Seniorenstift“, „im Seniorenstift am Obermain“, „der Pflegedienst“, „beim Pflegedienst“, „die Seniorenresidenz“, „in der Seniorenresidenz“. Verwende innerhalb der Anzeige denselben Namen; erfinde keinen neuen.
Ort: Nenne ausschließlich die Stadt bzw. den Ort – keine Straße, Hausnummer oder PLZ, auch wenn eine vollständige Adresse in den Fakten oder Hinweisen steht. Beispiel: „Musterstraße 12, 96231 Bad Staffelstein“ wird „Bad Staffelstein“. Ist kein Ort erkennbar, lasse die Ortsangabe weg; rate nicht. Diese Regeln gelten auch für Namen und Adressen aus zusätzlichen Kampagnenhinweisen. Die Beispiele sind keine Kampagnenfakten und dürfen nur verwendet werden, wenn sie tatsächlich in den Kampagnenfakten stehen.`;

function benefitSelection(benefits: string): string {
  const count = new Set(benefits.split("\n").map((line) => line.trim().toLowerCase()).filter(Boolean)).size;
  return `Die Eingabe enthält ${count} Benefits (eine Zeile je Benefit, auch weiche Vorteile zählen). Schreibe ${Math.min(count, 5)} Benefit-Zeilen. ${count > 5 ? 'Danach ist die Schlusszeile „Und mehr...“ PFLICHT, weil die Eingabe mehr als fünf Benefits enthält.' : 'Keine Schlusszeile „Und mehr...“, da keine weiteren Benefits übrig bleiben.'}
Benefit-Auswahl: Wähle genau fünf unterschiedliche Benefits, sofern mindestens fünf belegt sind. Sind weniger als fünf vorhanden, nenne alle vorhandenen, ohne etwas zu erfinden oder einen Benefit aufzuteilen. Wähle die stärksten für die beworbene Rolle, nicht einfach die ersten: konkrete Vorteile wie Gehalt, Zuschläge, Urlaubstage und planbare Arbeitszeiten vor allgemeinen Aussagen über Team oder Wertschätzung; danach passende Mobilitäts- und Weiterbildungsvorteile. Stärkster Benefit zuerst; passe Reihenfolge und Emojis der Vorlage daran an. Enthalten die Eingaben mehr als fünf unterschiedliche belegte Benefits, folgt unmittelbar nach den fünf Listenpunkten IMMER eine eigene Zeile mit exakt „Und mehr...“, auch wenn weitere Benefits schon im Fließtext erwähnt werden; bei höchstens fünf entfällt diese Zeile. Das ist kein sechster Benefit. Diese Auswahl gilt für jede Vorlage, auch für die Kurzform und die Wertewelt; ergänze dort die Liste und kürze dafür den übrigen Fließtext.`;
}

/** Ein Block für alle drei Prompts; leer, wenn es nichts zu sagen gibt. */
function instructionsBlock(instructions?: string): string {
  const text = instructions?.trim();
  if (!text) return "";
  return `ZUSÄTZLICHE KAMPAGNENHINWEISE (steuern Stil, Ansprache, Schwerpunkte und Ausschlüsse – die Regeln oben gelten weiter: keine erfundenen Benefits, Längen und Ausgabeformat bleiben):
${text}

`;
}

/** Rollenkürzel zu den Wörtern, die in einer Anzeige stehen können. `prompt`
 * vor `label`: die KI-Fassung darf mehr sagen als das UI (siehe ROLES). */
export function roleLabels(roles: string[], roleFreeText?: string): string[] {
  const labels: string[] = roles.flatMap((code) => {
    const role = ROLES.find((r) => r.code === code);
    const label = role?.prompt ?? role?.label;
    return label ? [label] : [];
  });
  const free = roleFreeText?.trim();
  if (free) labels.push(free);
  return labels;
}

// Die fünf Vorlagen: die erste mit Platzhaltern, die vier weiteren als fertige
// Beispiele derselben Kampagne – sie zeigen Ton, Länge und Emoji-Gebrauch.
// Ein Eintrag je Primärtext-Slot im Dialog.
const TEMPLATES = [
  `VORLAGE (mit Platzhaltern):
Du bist {Bezeichnung/en} in {Ort} oder Umgebung?

Dann bist Du bei {Arbeitgeber} genau richtig! Wir suchen motivierte Verstärkung.

Es wird viel Wert auf ein faires Miteinander, Wertschätzung untereinander und Begegnung auf Augenhöhe gelegt. Die Teamatmosphäre ist freundlich und familiär.

Bei uns erwarten Dich…

🏖️ {Benefit 1}
🚲 {Benefit 2}
🎄 {Benefit 3}
🗓️ {Benefit 4, wenn vorhanden}
📚 {Benefit 5, wenn vorhanden – je Benefit ein inhaltlich passendes Emoji; bleiben weitere Benefits übrig, folgt „Und mehr...“}

Hast Du Lust auf ein tolles Miteinander und möchtest Dich weiterentwickeln?

Bewirb Dich einfach und unkompliziert bei uns in nur 60 Sekunden - ohne Anschreiben und Lebenslauf. 📲

Klicke dazu einfach auf "Jetzt bewerben"

Wir haben aktuell noch Stellen offen für:

✅ {Offene Stelle 1}
✅ {Offene Stelle 2, wenn zutreffend und mehr...}`,

  `BEISPIEL (Stellen-Aufmacher mit Benefit-Liste):
Pflegefachkraft (m/w/d) oder stellvertretende Pflegedienstleitung (m/w/d) in Greiz gesucht!

Der AWO Kreisverband Greiz e.V. sucht Verstärkung für den ambulanten Pflegedienst.

▶ Jetzt in 60 Sekunden ohne Anschreiben und Lebenslauf bewerben!

Freue Dich auf...

✅ Weihnachts- & Urlaubsgeld
✅ Mindestens 30 Urlaubstage + 2 Regenerationstage
✅ JobRad
✅ Kostenlose Weiterbildungen
✅ Freundliches & familiäres Team

Hast Du Lust auf ein kollegiales Miteinander und möchtest Dich weiterentwickeln?

Bewirb Dich einfach und unkompliziert in nur 60 Sekunden – ohne Anschreiben und Lebenslauf. 📲

Klicke dazu einfach auf "Jetzt bewerben"

Wir haben aktuell noch Stellen offen für:

✅ Pflegefachkraft für den ambulanten Dienst
✅ Stellvertretende Pflegedienstleitung für den ambulanten Dienst`,

  `BEISPIEL (kurz und direkt):
Werde Pflegefachkraft (m/w/d) oder stellvertretende Pflegedienstleitung (sPDL) (m/w/d) beim AWO Kreisverband Greiz e.V. in Greiz!! 📍💪

Wir suchen engagierte Mitarbeitende, die unser freundliches und familiäres Team im ambulanten Pflegedienst unterstützen. 🤝

Freue Dich auf:
✅ Weihnachts- & Urlaubsgeld
✅ Mindestens 30 Urlaubstage + 2 Regenerationstage
✅ JobRad
✅ Kostenlose Weiterbildungen
✅ Freundliches & familiäres Team

Wir haben aktuell noch Stellen offen für:

✅ Pflegefachkraft für den ambulanten Dienst
✅ Stellvertretende Pflegedienstleitung für den ambulanten Dienst`,

  `BEISPIEL (Wertewelt mit Benefit-Liste):
Träumst du nicht auch davon, in einer Umgebung zu arbeiten, die genau das verkörpert?

Ein Team, das Zusammenhalt und gegenseitige Unterstützung lebt:

Beim AWO Kreisverband Greiz e.V. wird Teamarbeit großgeschrieben. Unsere Mitarbeitenden unterstützen sich gegenseitig und begegnen sich mit Respekt und Wertschätzung.

Ein angenehmes Arbeitsklima, das persönliches und berufliches Wachstum fördert:

Mit kostenlosen Weiterbildungen hast du die Möglichkeit, dich kontinuierlich weiterzuentwickeln.

Nicht nur als Arbeitskraft, sondern als Mensch mit individuellen Bedürfnissen gesehen werden:

Wir zeigen Wertschätzung durch ein familiäres Miteinander und attraktive Zusatzleistungen.

Freue Dich auf:
✅ Weihnachts- & Urlaubsgeld
✅ Mindestens 30 Urlaubstage + 2 Regenerationstage
✅ JobRad
✅ Kostenlose Weiterbildungen
✅ Freundliches & familiäres Team

Deshalb klicke einfach auf "Jetzt bewerben" und bewirb dich mit nur wenigen Klicks online.
Bis gleich :)

Wir haben aktuell noch Stellen offen für:

✅ Pflegefachkraft für den ambulanten Dienst
✅ Stellvertretende Pflegedienstleitung für den ambulanten Dienst`,

  `BEISPIEL (emotionaler Einstieg, Du-Ansprache):
Du gibst jeden Tag dein Bestes in der Pflege – aber wer sorgt eigentlich für Dich? 💬

Wenn Du Pflegefachkraft (m/w/d) oder stellvertretende Pflegedienstleitung (m/w/d) aus Greiz oder Umgebung bist und Dir ein echtes WIR-Gefühl, faire Bedingungen und ein wertschätzendes Miteinander wichtig sind, dann lies jetzt unbedingt weiter:

Denn beim AWO Kreisverband Greiz e.V. zählt nicht nur der Dienstplan – sondern der Mensch dahinter.

💥 DAS ERWARTET DICH BEI UNS:

✔ Weihnachts- & Urlaubsgeld
✔ Mindestens 30 Urlaubstage + 2 Regenerationstage
✔ JobRad
✔ Kostenlose Weiterbildungen
✔ Freundliches & familiäres Team

Was Du mitbringen solltest?

Herz, Verstand – und den Wunsch, Menschen mit Engagement, Empathie und Teamgeist zu begleiten.

📲 Bewirb Dich jetzt in nur 60 Sekunden – ganz ohne Anschreiben oder Lebenslauf.

Denn manchmal beginnt der beste Job einfach mit einem Klick. 👇`,
];

/** Ein Slot je Vorlage – der Dialog zeigt so viele Skelette. */
export const BODY_TEMPLATE_COUNT = TEMPLATES.length;

function prompt(input: BodiesInput, template: number): string {
  const { business, roles, roleFreeText, place, benefits } = input;
  const rollen = roleLabels(roles, roleFreeText);
  const fakten = [
    `Arbeitgeber: ${business.trim() || "unbekannt – schreibe neutral von „uns“ und „unserem Team“"}`,
    `Gesuchte Rollen: ${rollen.length ? rollen.join(", ") : "keine angegeben – schreibe allgemein von Verstärkung in der Pflege"}`,
    `Ort: ${place?.trim() || "keiner angegeben – lasse Ortsangaben weg"}`,
    `Benefits laut Arbeitgeber: ${benefits.trim() || "keine angegeben – nenne keine konkreten Benefits, bleibe bei Team und Miteinander"}`,
  ].join("\n");

  return `Du schreibst den Primärtext einer Meta-Stellenanzeige (Facebook/Instagram) einer Personalmarketing-Agentur für Pflegeeinrichtungen.

Schreibe genau einen deutschen Primärtext für die folgende Kampagne, im Stil und in ähnlicher Länge der Vorlage unten. Ersetze alle Platzhalter und alle AWO-Greiz-spezifischen Angaben durch die Kampagnenfakten. Du darfst die Formulierungen der Vorlage frei umschreiben, damit nicht jede Anzeige gleich klingt – Struktur, Ton und Länge bleiben erhalten. Duze die Lesenden. Erfinde keine Fakten: nur die genannten Rollen, den genannten Ort und die genannten Benefits verwenden. Gegen Ende steht eine Aufforderung, auf „Jetzt bewerben“ zu klicken (bei der Kurzform optional).

Der Text endet IMMER mit dem Block der offenen Stellen – auch wenn die Vorlage keinen hat: eine Zeile wie „Wir haben aktuell noch Stellen offen für:“ (darf umformuliert sein, nie weggelassen, trägt selbst KEIN Emoji), darunter je gesuchte Rolle eine eigene Zeile, die IMMER mit ✅ beginnt. In diesem Block ist ✅ das einzige erlaubte Zeichen – nie ein anderes Emoji, kein ✔, kein 👉, auch wenn die Benefit-Liste weiter oben andere Emojis nutzt.

Formatierung: Reiner Text – Meta unterstützt KEIN Markdown. Keine **Sternchen**, keine #-Überschriften, keine Markdown-Listen mit - oder *; nur Absätze, Leerzeilen und Emojis wie in der Vorlage. Übernimm den Listenstil der Vorlage: JEDER genannte Benefit bekommt eine eigene Zeile mit genau einem Aufzählungszeichen im Stil der Vorlage (✅, ✔ oder ein thematisch passendes Emoji je Zeile – bei Emoji-Listen für jeden Benefit ein anderes, inhaltlich passendes). Niemals mehrere Benefits in eine Zeile zusammenziehen.

${COPY_LANGUAGE}

KAMPAGNENFAKTEN:
${fakten}

${TEMPLATES[template]}

Die Vorlage zeigt nur den Stil. Für Anzahl und Abschluss der Benefits gilt stattdessen verbindlich:
${benefitSelection(input.benefits)}

${instructionsBlock(input.instructions)}Antworte ausschließlich mit dem fertigen Primärtext – ohne Anführungszeichen drumherum, ohne Überschrift, ohne Erklärung.`;
}

/**
 * Antwort robust lesen: verlangt ist reiner Text, aber ein Markdown-Zaun oder
 * umschließende Anführungszeichen kommen trotzdem vor – die fliegen raus.
 */
export function parseBody(content: string): string {
  const text = content
    .replace(/^\s*```[a-z]*\s*|\s*```\s*$/g, "")
    // Meta rendert kein Markdown – **fett** aus dem Modell wäre sichtbarer Müll.
    .replace(/\*\*/g, "")
    .trim()
    .replace(/^["„]|["“]$/g, "")
    .trim();
  if (!text) throw new Error("Mistral hat keinen Text geliefert.");
  return text;
}

// small statt large: large brauchte ~40 s je Text – für Anzeigentexte nach
// fester Vorlage reicht small und antwortet in wenigen Sekunden.
const MODEL = "mistral-medium-latest";

/** Ein Prompt, eine Antwort als roher Text – geteilt von Text, Überschriften
 *  und Beschreibung; mit Bildteilen im Inhalt auch von lib/headline.ts.
 *
 *  Alle Aufrufe laufen gedrosselt (acquire unten); ein 429 wird trotzdem mit
 *  Backoff wiederholt – anders als bei Metas Stundenbudget (lib/graph.ts) ist
 *  Mistrals Limit ein Requests-pro-Sekunde-Fenster, Sekunden später ist es
 *  wieder frei. */
export async function mistral(
  content: string | { type: string; [k: string]: string }[],
  opts: { model?: string; temperature?: number } = {},
): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("MISTRAL_API_KEY fehlt in der Umgebung (.env.local).");

  const release = await acquire();
  try {
    return await request(key, content, opts);
  } finally {
    release();
  }
}

// Der Dialog feuert sieben Aufrufe je Standort, ein PDF-Export zwölf
// Überschriften – alle zur selben Millisekunde. Hier laufen alle Aufrufe
// durch: höchstens SLOTS gleichzeitig, zwischen zwei Starts mindestens GAP_MS.
// Mit Pay-as-you-go erlaubt Mistral 1000 Anfragen/Minute – die Drossel ist
// nur noch Schutz gegen Stoßlasten, nicht mehr das Tempo. Ohne Pay-as-you-go
// steht das Limit auf 0 und keine Drossel hilft (x-ratelimit-limit-req-minute).
// ponytail: prozessweit, ohne Prioritäten – je Nutzer drosseln, falls mehrere
// Bediener gleichzeitig arbeiten und sich gegenseitig bremsen.
const SLOTS = 6;
const GAP_MS = 100;
let running = 0;
let lastStart = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<() => void> {
  if (running >= SLOTS) await new Promise<void>((r) => waiting.push(r));
  running++;
  // Startzeit sofort reservieren, dann erst schlafen – sonst lesen zwei Wartende
  // denselben lastStart und starten doch gleichzeitig.
  const start = Math.max(Date.now(), lastStart + GAP_MS);
  lastStart = start;
  if (start > Date.now()) await new Promise((r) => setTimeout(r, start - Date.now()));
  return () => {
    running--;
    waiting.shift()?.();
  };
}

async function request(
  key: string,
  content: string | { type: string; [k: string]: string }[],
  opts: { model?: string; temperature?: number },
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: opts.model ?? MODEL,
        temperature: opts.temperature ?? 0.7,
        messages: [{ role: "user", content }],
      }),
    });
    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok)
      throw new Error(`Mistral antwortet mit ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const answer = data.choices?.[0]?.message?.content;
    if (typeof answer !== "string") throw new Error("Mistral hat keinen Text geliefert.");
    return answer;
  }
}

/** Ein Primärtext nach einer der fünf Vorlagen (Index 0–4). */
export async function generateBody(input: BodiesInput, template: number): Promise<string> {
  if (!TEMPLATES[template]) throw new Error(`Unbekannte Vorlage ${template}.`);
  return parseBody(await mistral(prompt(input, template)));
}

/** So viele Überschriften rotiert Meta – ein Aufruf füllt alle fünf Felder. */
export const TITLE_COUNT = 5;

/**
 * Antwort robust lesen: JSON-Objekt mit "titel", zur Not mit Markdown-Zaun
 * drumherum. Zu Langes fällt weg statt gekürzt zu werden – was Metas Kürzung
 * nicht überlebt, kommt gar nicht erst ins Feld.
 */
export function parseTitles(content: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    throw new Error("Mistral hat kein lesbares JSON geliefert.");
  }
  const titles = Array.isArray(data) ? data : (data as { titel?: unknown }).titel;
  if (!Array.isArray(titles) || !titles.every((t) => typeof t === "string") || titles.length === 0)
    throw new Error("Mistral hat keine Überschriftenliste geliefert.");
  // Der Prompt verlangt mehr Kandidaten als Slots, und die 40 Zeichen sind
  // eine Vorliebe, keine Grenze: Meta kürzt nur die Anzeige, und laut
  // lib/copy.ts ist eine lange Überschrift neben kurzen der Normalfall. Das
  // Modell zählt Zeichen notorisch schlecht – ein harter Schnitt bei 40 ließ
  // deshalb Felder leer. Also: erst alles Kurze, dann die kürzesten der etwas
  // längeren; nur klar Aufgeblähtes (über 60) fliegt ganz raus.
  const clean: string[] = [];
  for (const raw of titles) {
    const t = raw.trim();
    if (!t || t.length > 60 || clean.some((o) => o.toLowerCase() === t.toLowerCase())) continue;
    clean.push(t);
  }
  if (!clean.length) throw new Error("Alle Vorschläge waren zu lang für Metas Kürzung.");
  const short = clean.filter((t) => t.length <= 40);
  const longer = clean.filter((t) => t.length > 40).sort((a, b) => a.length - b.length);
  return [...short, ...longer].slice(0, TITLE_COUNT);
}

/**
 * Überschriften, an Metas Anzeige gemessen: nach 40 Zeichen kürzt Meta, die
 * kürzeste laufende liegt im Median bei 14. Fünf gesuchte Rollen passen da
 * nie hinein – das sagt der Prompt ausdrücklich, statt es zu hoffen.
 */
function titlesPrompt(input: BodiesInput): string {
  const rollen = roleLabels(input.roles, input.roleFreeText);
  const fakten = [
    `Arbeitgeber: ${input.business.trim() || "unbekannt"}`,
    `Gesuchte Rollen: ${rollen.length ? rollen.join(", ") : "keine angegeben"}`,
    `Ort: ${input.place?.trim() || "keiner angegeben"}`,
    `Benefits laut Arbeitgeber: ${input.benefits.trim() || "keine angegeben"}`,
  ].join("\n");

  return `Du schreibst Überschriften für Meta-Stellenanzeigen (Facebook/Instagram) in der Pflege.

Schreibe 8 deutsche Überschriften für die folgende Kampagne – verwendet werden die besten fünf, Meta rotiert sie in einer Anzeige. Sie müssen verschiedene Winkel abdecken, keine zwei dürfen sich ähneln.

Die wichtigste Regel: Jede Überschrift muss FÜR SICH ALLEIN sagen, dass hier ein Job angeboten wird und in welchem Feld – über die Rolle („Pflegefachkraft (m/w/d) gesucht“), das Feld („Dein neuer Job in der Pflege“) oder den Arbeitgeber als Suchenden („{Arbeitgeber} sucht dich“). Ein Benefit oder Ort allein sagt nichts: „{Benefit} in {Ort}“ könnte alles bewerben und ist verboten. Benefits nur mit Job-Kontext im selben Satz („{Benefit} als Pflegefachkraft“) – und nur Benefits, die wörtlich in den Kampagnenfakten stehen, keine Zahlen oder Leistungen von anderswo.

Weitere Regeln:
- Höchstens 40 Zeichen je Überschrift (danach kürzt Meta), mindestens zwei deutlich kürzer (15–25 Zeichen).
- Bei mehreren gesuchten Rollen: NIE alle in einer Überschrift aufzählen – das wird zu lang. Nimm je Überschrift eine einzelne Rolle oder einen Sammelbegriff wie „Pflege-Jobs“; über die Überschriften verteilt dürfen verschiedene Rollen vorkommen.
- Steht eine Rolle in der Überschrift, dann mit „(m/w/d)“ – außer es sprengt die 40 Zeichen.
- Mische die Winkel: Rolle (+ Ort, wenn er kurz ist), Arbeitgeber sucht, Frage oder Aufforderung, Benefit mit Job-Kontext.
- Duze. Keine erfundenen Fakten – nur genannte Rollen, Ort und Benefits. Keine Emojis.

${COPY_LANGUAGE}

KAMPAGNENFAKTEN:
${fakten}

${instructionsBlock(input.instructions)}Antworte ausschließlich mit JSON: {"titel": ["…", "…"]}`;
}

/** Die fünf Überschriften – kurz, gemischt, höchstens 40 Zeichen. */
export async function generateTitles(input: BodiesInput): Promise<string[]> {
  return parseTitles(await mistral(titlesPrompt(input)));
}

/**
 * Die Beschreibung unter der Überschrift: im Kern die Benefits als Liste.
 * Eine je Zeile mit einheitlichem Zeichen – dieselbe Formatregel wie bei den
 * Primärtexten, nur ohne Fließtext drumherum.
 */
function descriptionPrompt(input: BodiesInput): string {
  return `Du schreibst die Beschreibung einer Meta-Stellenanzeige (Facebook/Instagram) in der Pflege – der kurze Block, der unter der Überschrift steht.

Formatiere die ausgewählten Benefits als Liste: eine kurze Kopfzeile wie „Freue Dich auf...“, dann jeder ausgewählte Benefit auf einer eigenen Zeile mit ✅ am Anfang. Niemals mehrere Benefits in eine Zeile zusammenziehen, keinen erfinden. Danach eine Schlusszeile mit Aufforderung, sich in 60 Sekunden ohne Anschreiben und Lebenslauf zu bewerben. Duze.

${COPY_LANGUAGE}

${benefitSelection(input.benefits)}

BENEFITS:
${input.benefits.trim() || "keine angegeben – schreibe zwei kurze Zeilen über das Team und die Bewerbung in 60 Sekunden"}

${instructionsBlock(input.instructions)}Antworte ausschließlich mit der fertigen Beschreibung – ohne Anführungszeichen drumherum, ohne Erklärung.`;
}

/** Die Beschreibung – Benefits sauber als ✅-Liste formatiert. */
export async function generateDescription(input: BodiesInput): Promise<string> {
  return parseBody(await mistral(descriptionPrompt(input)));
}
