import { costPerResult, results, type Insights } from "@/lib/campaigns";

/**
 * Die Kennzahlen einer Kampagne – eine Liste, aus der Tabelle, Kacheln und
 * Sortierung dieselben Zahlen lesen. Fehlende Werte sind "—", nie "NaN" oder
 * "€NaN": viele Kampagnen tragen in einem Zeitraum schlicht nichts bei.
 */
const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const ZAHL = new Intl.NumberFormat("de-DE");

export const money = (n?: number) => (n === undefined || !Number.isFinite(n) ? "—" : EUR.format(n));
export const zahl = (n?: number) => (n === undefined || !Number.isFinite(n) ? "—" : ZAHL.format(n));
export const prozent = (n?: number) =>
  n === undefined || !Number.isFinite(n) ? "—" : `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
const dezimal = (n?: number) =>
  n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

/** Number("") ist 0, Number(undefined) ist NaN – beides ist hier "kein Wert". */
const num = (s?: string) => (s === undefined || s === "" ? undefined : Number(s));

export type Kennzahl = {
  key: string;
  label: string;
  /** Die Erklärung im Tooltip – was Meta genau zählt. */
  hilfe: string;
  wert: (i?: Insights) => number | undefined;
  format: (n?: number) => string;
  /** Kleiner ist besser (Kosten) – für die Sortierung und die Vorgabe der Richtung. */
  kosten?: boolean;
};

export const KENNZAHLEN: Kennzahl[] = [
  { key: "spend", label: "Ausgaben", hilfe: "Was Meta im Zeitraum abgerechnet hat.", wert: (i) => num(i?.spend), format: money },
  { key: "leads", label: "Leads", hilfe: "Abgeschickte Bewerbungen (Instant-Formular oder Pixel-Lead). Klicks und Formularansichten zählen nicht.", wert: results, format: zahl },
  { key: "cpl", label: "Kosten/Lead", hilfe: "Ausgaben geteilt durch Leads.", wert: costPerResult, format: money, kosten: true },
  { key: "reach", label: "Reichweite", hilfe: "Wie viele Personen die Anzeige mindestens einmal gesehen haben.", wert: (i) => num(i?.reach), format: zahl },
  { key: "impressions", label: "Impressionen", hilfe: "Wie oft die Anzeige gezeigt wurde – eine Person kann mehrfach zählen.", wert: (i) => num(i?.impressions), format: zahl },
  { key: "frequency", label: "Frequenz", hilfe: "Impressionen je erreichter Person. Über 3 wird die Zielgruppe müde.", wert: (i) => num(i?.frequency), format: dezimal },
  { key: "clicks", label: "Link-Klicks", hilfe: "Klicks auf den Link der Anzeige – nicht auf Bild, Seite oder Gefällt-mir.", wert: (i) => num(i?.inline_link_clicks), format: zahl },
  { key: "ctr", label: "CTR", hilfe: "Link-Klicks je 100 Impressionen. Unter 1 % lohnt ein neues Creative.", wert: (i) => num(i?.inline_link_click_ctr), format: prozent },
  { key: "cpc", label: "CPC", hilfe: "Kosten je Link-Klick.", wert: (i) => num(i?.cost_per_inline_link_click), format: money, kosten: true },
  { key: "cpm", label: "CPM", hilfe: "Kosten je 1 000 Impressionen – der Preis der Zielgruppe.", wert: (i) => num(i?.cpm), format: money, kosten: true },
];

export const kennzahl = (key: string) => KENNZAHLEN.find((k) => k.key === key)!;
