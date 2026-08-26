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
};

/** Rollenkürzel zu den Wörtern, die in einer Anzeige stehen können. */
export function roleLabels(roles: string[], roleFreeText?: string): string[] {
  const labels: string[] = roles.flatMap((code) => {
    const label = ROLES.find((r) => r.code === code)?.label;
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
🎄 {Benefit 3 – je Benefit eine eigene Zeile mit eigenem, passendem Emoji; höchstens 5 Zeilen, bei mehr Benefits die stärksten wählen und mit „Und mehr…“ schließen}

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

Wir haben aktuell noch Stellen offen für:

✅ Pflegefachkraft für den ambulanten Dienst
✅ Stellvertretende Pflegedienstleitung für den ambulanten Dienst`,

  `BEISPIEL (Wertewelt, drei Absätze mit ✅):
Träumst du nicht auch davon, in einer Umgebung zu arbeiten, die genau das verkörpert?

✅ Ein Team, das Zusammenhalt und gegenseitige Unterstützung lebt:

Beim AWO Kreisverband Greiz e.V. wird Teamarbeit großgeschrieben. Unsere Mitarbeitenden unterstützen sich gegenseitig und begegnen sich mit Respekt und Wertschätzung.

✅ In einem angenehmen Arbeitsklima, das persönliches und berufliches Wachstum fördert:

Mit kostenlosen Weiterbildungen hast du die Möglichkeit, dich kontinuierlich weiterzuentwickeln.

✅ Nicht nur als Arbeitskraft, sondern als Mensch mit individuellen Bedürfnissen gesehen werden:

Wir zeigen Wertschätzung durch ein familiäres Miteinander und attraktive Zusatzleistungen.

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

function prompt({ business, roles, roleFreeText, place, benefits }: BodiesInput, template: number): string {
  const rollen = roleLabels(roles, roleFreeText);
  const fakten = [
    `Arbeitgeber: ${business.trim() || "unbekannt – schreibe neutral von „uns“ und „unserem Team“"}`,
    `Gesuchte Rollen: ${rollen.length ? rollen.join(", ") : "keine angegeben – schreibe allgemein von Verstärkung in der Pflege"}`,
    `Ort: ${place?.trim() || "keiner angegeben – lasse Ortsangaben weg"}`,
    `Benefits laut Arbeitgeber: ${benefits.trim() || "keine angegeben – nenne keine konkreten Benefits, bleibe bei Team und Miteinander"}`,
  ].join("\n");

  return `Du schreibst den Primärtext einer Meta-Stellenanzeige (Facebook/Instagram) einer Personalmarketing-Agentur für Pflegeeinrichtungen.

Schreibe genau einen deutschen Primärtext für die folgende Kampagne, im Stil und in ähnlicher Länge der Vorlage unten. Ersetze alle Platzhalter und alle AWO-Greiz-spezifischen Angaben durch die Kampagnenfakten. Du darfst die Formulierungen der Vorlage frei umschreiben, damit nicht jede Anzeige gleich klingt – Struktur, Ton und Länge bleiben erhalten. Duze die Lesenden. Erfinde keine Fakten: nur die genannten Rollen, den genannten Ort und die genannten Benefits verwenden. Gegen Ende steht eine Aufforderung, auf „Jetzt bewerben“ zu klicken (bei der Kurzform optional).

Der Text endet IMMER mit dem Block der offenen Stellen – auch wenn die Vorlage keinen hat: eine Zeile wie „Wir haben aktuell noch Stellen offen für:“ (darf umformuliert sein, nie weggelassen), darunter je gesuchte Rolle eine eigene Zeile mit ✅ am Anfang.

Formatierung: Reiner Text – Meta unterstützt KEIN Markdown. Keine **Sternchen**, keine #-Überschriften, keine Markdown-Listen mit - oder *; nur Absätze, Leerzeilen und Emojis wie in der Vorlage. Übernimm den Listenstil der Vorlage: JEDER genannte Benefit bekommt eine eigene Zeile mit genau einem Aufzählungszeichen im Stil der Vorlage (✅, ✔ oder ein thematisch passendes Emoji je Zeile – bei Emoji-Listen für jeden Benefit ein anderes, inhaltlich passendes). Niemals mehrere Benefits in eine Zeile zusammenziehen. Höchstens 5 Benefit-Zeilen: Stehen mehr Benefits in den Kampagnenfakten, wähle die stärksten aus und schließe die Liste mit einer Zeile wie „Und mehr…“ ab.

KAMPAGNENFAKTEN:
${fakten}

${TEMPLATES[template]}

Antworte ausschließlich mit dem fertigen Primärtext – ohne Anführungszeichen drumherum, ohne Überschrift, ohne Erklärung.`;
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
const MODEL = "mistral-small-latest";

/** Ein Prompt, eine Antwort als roher Text – geteilt von Text, Überschriften
 *  und Beschreibung.
 *
 *  429 wird mit Backoff wiederholt – anders als bei Metas Stundenbudget
 *  (lib/graph.ts) ist Mistrals Limit ein Requests-pro-Sekunde-Fenster: die
 *  fünf parallelen Aufrufe des Dialogs reißen es kurz, Sekunden später ist
 *  es wieder frei. */
async function mistral(promptText: string): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("MISTRAL_API_KEY fehlt in der Umgebung (.env.local).");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        messages: [{ role: "user", content: promptText }],
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
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Mistral hat keinen Text geliefert.");
    return content;
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

KAMPAGNENFAKTEN:
${fakten}

Antworte ausschließlich mit JSON: {"titel": ["…", "…"]}`;
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

Formatiere die folgenden Benefits als Liste: eine kurze Kopfzeile wie „Freue Dich auf...“, dann JEDER Benefit auf einer eigenen Zeile mit ✅ am Anfang. Niemals mehrere Benefits in eine Zeile zusammenziehen, keinen Benefit weglassen, keinen erfinden. Danach eine Schlusszeile mit Aufforderung, sich in 60 Sekunden ohne Anschreiben und Lebenslauf zu bewerben. Duze.

BENEFITS:
${input.benefits.trim() || "keine angegeben – schreibe zwei kurze Zeilen über das Team und die Bewerbung in 60 Sekunden"}

Antworte ausschließlich mit der fertigen Beschreibung – ohne Anführungszeichen drumherum, ohne Erklärung.`;
}

/** Die Beschreibung – Benefits sauber als ✅-Liste formatiert. */
export async function generateDescription(input: BodiesInput): Promise<string> {
  return parseBody(await mistral(descriptionPrompt(input)));
}
