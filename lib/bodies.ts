/**
 * Primärtexte per Mistral – anders als die Überschriften (lib/headlines.ts)
 * sind das keine Einzeiler, die eine Vorlage mit zwei Ersetzungen hergibt:
 * fünf verschiedene Erzählwinkel auf denselben Arbeitgeber, mit Benefits im
 * Fließtext. Die Vorlagen unten stammen aus einer echten Kampagne (AWO Greiz);
 * das Modell füllt die Platzhalter mit den Kampagnendaten und schreibt die
 * gefüllten Beispiele auf den neuen Kunden um.
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
🎄 {Benefit 3 – je Benefit eine eigene Zeile mit eigenem, passendem Emoji; die Liste wird so lang wie die Benefit-Liste}

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

Schreibe genau einen deutschen Primärtext für die folgende Kampagne, im Stil und in ähnlicher Länge der Vorlage unten. Ersetze alle Platzhalter und alle AWO-Greiz-spezifischen Angaben durch die Kampagnenfakten. Duze die Lesenden. Erfinde keine Fakten: nur die genannten Rollen, den genannten Ort und die genannten Benefits verwenden. Der Text endet mit einer Aufforderung, auf „Jetzt bewerben“ zu klicken (bei der Kurzform optional).

Formatierung: Übernimm die Formatierung der Vorlage exakt – Absätze, Leerzeilen, Emojis und vor allem den Listenstil. Enthält die Vorlage eine Benefit-Liste, bekommt JEDER Benefit eine eigene Zeile mit genau einem Aufzählungszeichen im Stil der Vorlage (✅, ✔ oder ein thematisch passendes Emoji je Zeile – bei Emoji-Listen für jeden Benefit ein anderes, inhaltlich passendes). Niemals mehrere Benefits in eine Zeile zusammenziehen; die Liste wird so lang wie die Benefit-Liste in den Kampagnenfakten.

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
    .trim()
    .replace(/^["„]|["“]$/g, "")
    .trim();
  if (!text) throw new Error("Mistral hat keinen Text geliefert.");
  return text;
}

/** Ein Primärtext nach einer der fünf Vorlagen (Index 0–4). */
export async function generateBody(input: BodiesInput, template: number): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("MISTRAL_API_KEY fehlt in der Umgebung (.env.local).");
  if (!TEMPLATES[template]) throw new Error(`Unbekannte Vorlage ${template}.`);

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "mistral-large-latest",
      temperature: 0.7,
      messages: [{ role: "user", content: prompt(input, template) }],
    }),
  });
  if (!res.ok)
    throw new Error(`Mistral antwortet mit ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Mistral hat keinen Text geliefert.");
  return parseBody(content);
}
