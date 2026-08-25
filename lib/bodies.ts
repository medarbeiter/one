/**
 * Primärtexte per Mistral – anders als die Überschriften (lib/headlines.ts)
 * sind das keine Einzeiler, die eine Vorlage mit zwei Ersetzungen hergibt:
 * fünf verschiedene Erzählwinkel auf denselben Arbeitgeber, mit Benefits im
 * Fließtext. Die Vorlagen unten stammen aus einer echten Kampagne (AWO Greiz);
 * das Modell füllt die Platzhalter mit den Kampagnendaten und schreibt die
 * gefüllten Beispiele auf den neuen Kunden um.
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
const TEMPLATES = `VORLAGE 1 (mit Platzhaltern):
Du bist {Bezeichnung/en} in {Ort} oder Umgebung?

Dann bist Du bei {Arbeitgeber} genau richtig! Wir suchen motivierte Verstärkung.

Es wird viel Wert auf ein faires Miteinander, Wertschätzung untereinander und Begegnung auf Augenhöhe gelegt. Die Teamatmosphäre ist freundlich und familiär.

Bei uns erwarten Dich…

🏖️ {Benefit 1}
🚲 {Benefit 2}
🎄 {Benefit 3 und mehr ...}

Hast Du Lust auf ein tolles Miteinander und möchtest Dich weiterentwickeln?

Bewirb Dich einfach und unkompliziert bei uns in nur 60 Sekunden - ohne Anschreiben und Lebenslauf. 📲

Klicke dazu einfach auf "Jetzt bewerben"

Wir haben aktuell noch Stellen offen für:

✅ {Offene Stelle 1}
✅ {Offene Stelle 2, wenn zutreffend und mehr...}

BEISPIEL 2 (Stellen-Aufmacher mit Benefit-Liste):
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
✅ Stellvertretende Pflegedienstleitung für den ambulanten Dienst

BEISPIEL 3 (kurz und direkt):
Werde Pflegefachkraft (m/w/d) oder stellvertretende Pflegedienstleitung (sPDL) (m/w/d) beim AWO Kreisverband Greiz e.V. in Greiz!! 📍💪

Wir suchen engagierte Mitarbeitende, die unser freundliches und familiäres Team im ambulanten Pflegedienst unterstützen. 🤝

Wir haben aktuell noch Stellen offen für:

✅ Pflegefachkraft für den ambulanten Dienst
✅ Stellvertretende Pflegedienstleitung für den ambulanten Dienst

BEISPIEL 4 (Wertewelt, drei Absätze mit ✅):
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
✅ Stellvertretende Pflegedienstleitung für den ambulanten Dienst

BEISPIEL 5 (emotionaler Einstieg, Du-Ansprache):
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

Denn manchmal beginnt der beste Job einfach mit einem Klick. 👇`;

function prompt({ business, roles, roleFreeText, place, benefits }: BodiesInput): string {
  const rollen = roleLabels(roles, roleFreeText);
  const fakten = [
    `Arbeitgeber: ${business.trim() || "unbekannt – schreibe neutral von „uns“ und „unserem Team“"}`,
    `Gesuchte Rollen: ${rollen.length ? rollen.join(", ") : "keine angegeben – schreibe allgemein von Verstärkung in der Pflege"}`,
    `Ort: ${place?.trim() || "keiner angegeben – lasse Ortsangaben weg"}`,
    `Benefits laut Arbeitgeber: ${benefits.trim() || "keine angegeben – nenne keine konkreten Benefits, bleibe bei Team und Miteinander"}`,
  ].join("\n");

  return `Du schreibst Primärtexte für Meta-Stellenanzeigen (Facebook/Instagram) einer Personalmarketing-Agentur für Pflegeeinrichtungen.

Schreibe genau 5 deutsche Primärtexte für die folgende Kampagne – einen je Vorlage/Beispiel unten, im jeweiligen Stil und ähnlicher Länge. Ersetze alle Platzhalter und alle AWO-Greiz-spezifischen Angaben durch die Kampagnenfakten. Duze die Lesenden. Erfinde keine Fakten: nur die genannten Rollen, den genannten Ort und die genannten Benefits verwenden. Jeder Text endet mit einer Aufforderung, auf „Jetzt bewerben“ zu klicken (außer der Kurzform, dort ist sie optional). Emojis wie in den Vorlagen.

KAMPAGNENFAKTEN:
${fakten}

VORLAGEN:
${TEMPLATES}

Antworte ausschließlich mit JSON: {"texte": ["Text 1", "Text 2", "Text 3", "Text 4", "Text 5"]}`;
}

/**
 * Antwort robust lesen: response_format=json_object verspricht JSON, aber ein
 * Markdown-Zaun drumherum kommt trotzdem vor – der fliegt vorher raus.
 */
export function parseBodies(content: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    throw new Error("Mistral hat kein lesbares JSON geliefert.");
  }
  const texts = Array.isArray(data) ? data : (data as { texte?: unknown }).texte;
  if (!Array.isArray(texts) || texts.length === 0 || !texts.every((t) => typeof t === "string"))
    throw new Error("Mistral hat keine Textliste geliefert.");
  // Meta rotiert höchstens 5 – mehr wird still gekappt statt abgelehnt.
  return texts.slice(0, 5).map((t) => t.trim());
}

export async function generateBodies(input: BodiesInput): Promise<string[]> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("MISTRAL_API_KEY fehlt in der Umgebung (.env.local).");

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "mistral-large-latest",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt(input) }],
    }),
  });
  if (!res.ok)
    throw new Error(`Mistral antwortet mit ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Mistral hat keinen Text geliefert.");
  return parseBodies(content);
}
