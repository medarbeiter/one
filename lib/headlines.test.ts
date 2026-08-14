import { expect, test } from "bun:test";
import { fillTitles, freeTitleSlots, generateHeadlines, HEADLINE_SUGGESTIONS } from "./headlines";
import { HEADLINE_DISPLAY_LIMIT } from "./copy";

const unique = (xs: string[]) => new Set(xs).size === xs.length;

test("auch ohne Rolle und ohne Kundennamen kommt eine volle Auswahl heraus", () => {
  // Der Assistent kennt beides nicht zwingend – die Rollen sind optional, und
  // gewählt wird trotzdem aus zwanzig Vorschlägen.
  const titles = generateHeadlines({ business: "", roles: [] });
  expect(titles).toHaveLength(HEADLINE_SUGGESTIONS);
  expect(unique(titles)).toBe(true);
});

test("kein Vorschlag ist so lang, dass Meta ihn abschneidet", () => {
  // lib/copy.ts: über 40 Zeichen überlebt keine Überschrift Metas Kürzung –
  // ein Generator, der das erzeugt, arbeitet gegen die eigene Prüfung.
  for (const input of [
    { business: "", roles: [] },
    { business: "Herzhalt Pflegedienst", roles: ["PFK"] },
    { business: "Häusliche Krankenpflege Schölzke GmbH", roles: ["PDL"] },
  ]) {
    for (const title of generateHeadlines(input))
      expect(title.length).toBeLessThanOrEqual(HEADLINE_DISPLAY_LIMIT);
  }
});

test("die gewählte Rolle steht ausgeschrieben in den Vorschlägen", () => {
  const titles = generateHeadlines({ business: "", roles: ["PFK"] });
  expect(titles.some((t) => t.includes("Pflegefachkraft"))).toBe(true);
  // Die Rolle ist der spezifischste Teil – sie steht vorn, nicht hinter zwanzig
  // allgemeinen Zeilen, die eine Auswahl von fünf nie erreicht.
  expect(titles.slice(0, 5).some((t) => t.includes("Pflegefachkraft"))).toBe(true);
});

test("ohne Kürzel zählt die Rolle aus dem Freitext", () => {
  const titles = generateHeadlines({ business: "", roles: [], roleFreeText: "Koch" });
  expect(titles.some((t) => t.includes("Koch"))).toBe(true);
});

test("der Kundenname kommt vor, aber nicht in jeder zweiten Überschrift", () => {
  // 13 % der laufenden Anzeigen nennen den Kunden in der Überschrift (lib/copy.ts).
  // Eine Liste, in der er überall steht, bildet das Gegenteil ab.
  const titles = generateHeadlines({ business: "Herzhalt Pflegedienst", roles: [] });
  const named = titles.filter((t) => t.includes("Herzhalt Pflegedienst"));
  expect(named.length).toBeGreaterThan(0);
  expect(named.length).toBeLessThan(titles.length / 2);
});

test("ein langer Kundenname fällt weg, statt die Vorschläge zu füllen", () => {
  const business = "Häusliche Krankenpflege Schölzke GmbH";
  const titles = generateHeadlines({ business, roles: [] });
  expect(titles.some((t) => t.includes(business))).toBe(false);
  // Und die Auswahl bleibt trotzdem vollständig.
  expect(titles).toHaveLength(HEADLINE_SUGGESTIONS);
  expect(unique(titles)).toBe(true);
});

test("nur leere Felder zählen als freier Platz", () => {
  // Das frische Formular hat ein Feld, und das ist leer – fünf freie Plätze.
  expect(freeTitleSlots([""], 5)).toBe(5);
  expect(freeTitleSlots(["Wir suchen dich", "  ", ""], 5)).toBe(4);
  expect(freeTitleSlots(["a", "b", "c", "d", "e"], 5)).toBe(0);
});

test("übernommene Überschriften füllen erst die leeren Felder, dann neue", () => {
  // Sonst stünde eine übernommene Überschrift unter einem leeren Feld – und
  // leere Felder zwischen gefüllten meldet lib/copy.ts zu Recht als Fehler.
  expect(fillTitles(["Alt", "", ""], ["A", "B", "C"], 5)).toEqual(["Alt", "A", "B", "C"]);
  // Das Limit hält: fünf sind fünf, auch wenn mehr ausgewählt wurde.
  expect(fillTitles(["1", "2", "3", "4"], ["A", "B"], 5)).toEqual(["1", "2", "3", "4", "A"]);
  expect(fillTitles(["1", "2", "3", "4", "5"], ["A"], 5)).toEqual(["1", "2", "3", "4", "5"]);
});

test("dieselbe Eingabe ergibt dieselbe Liste", () => {
  // Kein Zufall: wer den Dialog zweimal öffnet, sieht nicht zwei Welten.
  const input = { business: "Herzhalt Pflegedienst", roles: ["PFK"] };
  expect(generateHeadlines(input)).toEqual(generateHeadlines(input));
});
