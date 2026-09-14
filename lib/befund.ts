/**
 * Befunde: warum eine Kampagne schlecht läuft und was dagegen hilft – aus den
 * Zahlen, die die Liste ohnehin hat. Nur aktive Kampagnen werden beurteilt;
 * eine pausierte kostet nichts, da gibt es nichts zu tun.
 *
 * Schwellen sind Faustregeln der Agentur (Recruiting-Leads in DACH), keine
 * Meta-Vorgaben. Was „teuer“ ist, misst sich am Median der anderen Kampagnen
 * in derselben Liste – nicht an einer festen Zahl, die je Beruf anders wäre.
 */
import { costPerResult, results, type Campaign, type Insights, type Period } from "./campaigns";

export type Stufe = "rot" | "gelb";
export type Befund = { stufe: Stufe; titel: string; warum: string; tipp: string };

const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const num = (s?: string) => (s === undefined || s === "" ? undefined : Number(s));
const prozent = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;

// ponytail: feste Faustregeln. Je Kunde/Beruf justierbar erst, wenn jemand es verlangt.
const CTR_SCHWACH = 1; // Link-CTR in %, darunter zieht das Creative nicht
const FREQUENZ_MUEDE = 3;
const TEURER_ALS_MEDIAN = 1.5;
const TREND_SCHLECHTER = 1.3;
const LIEFERT_NICHT = 0.5; // Anteil vom Budget × Tage
const MIN_IMPRESSIONEN = 1000;
const MIN_PEERS = 3;

/** Tage im Zeitraum – bei „Gesamt“ seit dem Start. */
export function tage(period: Period, start_time?: string, jetzt = Date.now()): number {
  if (period === "today") return 1;
  if (period === "last_7d") return 7;
  if (period === "last_30d") return 30;
  const start = start_time ? Date.parse(start_time) : NaN;
  return Number.isFinite(start) ? Math.max(1, Math.ceil((jetzt - start) / 86_400_000)) : 30;
}

export function median(werte: number[]): number | undefined {
  const s = werte.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return undefined;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Umfeld = { cpl?: number; cpm?: number };

/** Der Median über die Kampagnen, die im Zeitraum Zahlen haben – erst ab MIN_PEERS. */
export function umfeld(campaigns: Campaign[], period: Period): Umfeld {
  const cpls = campaigns.map((c) => costPerResult(c.insights?.[period])).filter((n): n is number => n !== undefined);
  const cpms = campaigns.map((c) => num(c.insights?.[period]?.cpm)).filter((n): n is number => n !== undefined && n > 0);
  return {
    cpl: cpls.length >= MIN_PEERS ? median(cpls) : undefined,
    cpm: cpms.length >= MIN_PEERS ? median(cpms) : undefined,
  };
}

export function befunde(c: Campaign, period: Period, u: Umfeld = {}, jetzt = Date.now()): Befund[] {
  if (c.status !== "ACTIVE") return [];
  const i: Insights | undefined = c.insights?.[period];
  const out: Befund[] = [];
  const spend = num(i?.spend) ?? 0;
  const leads = results(i) ?? 0;
  const cpl = costPerResult(i);
  const ctr = num(i?.inline_link_click_ctr);
  const cpm = num(i?.cpm);
  const frequenz = num(i?.frequency);
  const impressionen = num(i?.impressions) ?? 0;
  const budget = c.daily_budget !== undefined ? Number(c.daily_budget) / 100 : undefined;
  const t = tage(period, c.start_time, jetzt);

  // Der Tag ist erst halb um – Auslieferung wird nicht am „Heute“ gemessen.
  if (period !== "today") {
    if (spend === 0)
      out.push({
        stufe: "gelb",
        titel: "Keine Ausgaben",
        warum: "Aktiv, aber Meta hat im Zeitraum nichts ausgeliefert.",
        tipp: "Anzeigen in Prüfung oder abgelehnt, Anzeigengruppe pausiert, Zahlungsmittel? Im Ads Manager nachsehen.",
      });
    else if (budget && spend < LIEFERT_NICHT * budget * t)
      out.push({
        stufe: "gelb",
        titel: "Liefert nicht aus",
        warum: `Nur ${prozent((spend / (budget * t)) * 100)} des Budgets (${EUR.format(budget * t)}) ausgegeben.`,
        tipp: "Zielgruppe zu eng oder einzelne Anzeigen abgelehnt – Targeting erweitern, Anzeigen prüfen.",
      });
  }

  const creativeSchwach = ctr !== undefined && ctr < CTR_SCHWACH && impressionen >= MIN_IMPRESSIONEN;
  const zielgruppeTeuer = cpm !== undefined && u.cpm !== undefined && cpm > TEURER_ALS_MEDIAN * u.cpm;

  // Geld ohne Bewerbung: ab zwei Tagesbudgets (mindestens 20 €) ist es kein Anlaufen mehr.
  if (leads === 0 && spend >= Math.max(20, 2 * (budget ?? 0)))
    out.push({
      stufe: "rot",
      titel: "Keine Leads",
      warum: `${EUR.format(spend)} ausgegeben, keine einzige Bewerbung.`,
      tipp: creativeSchwach
        ? `Kaum jemand klickt (CTR ${prozent(ctr!)}) – neues Bild oder Video, andere Ansprache.`
        : "Klicks kommen, aber niemand schickt das Formular ab – Formular kürzen, Fragen und Datenschutz-Link prüfen.",
    });

  if (cpl !== undefined && u.cpl !== undefined && cpl > TEURER_ALS_MEDIAN * u.cpl)
    out.push({
      stufe: leads === 0 ? "rot" : "gelb",
      titel: "Teurer als der Schnitt",
      warum: `${EUR.format(cpl)} je Lead, die anderen Kampagnen liegen bei ${EUR.format(u.cpl)}.`,
      tipp: creativeSchwach
        ? "Das Creative zieht nicht – neues Motiv testen."
        : zielgruppeTeuer
          ? "Die Zielgruppe ist teuer – Region oder Alter erweitern, Platzierungen freigeben."
          : "Klicks sind da, Leads fehlen – Formular vereinfachen, Stellenanzeige konkreter machen.",
    });

  if (creativeSchwach && !out.some((b) => b.titel === "Keine Leads"))
    out.push({
      stufe: "gelb",
      titel: "Creative zieht nicht",
      warum: `CTR ${prozent(ctr!)} bei ${impressionen.toLocaleString("de-DE")} Impressionen.`,
      tipp: "Unter 1 % lohnt ein neues Bild oder Video – erster Satz und Motiv entscheiden.",
    });

  if (frequenz !== undefined && frequenz > FREQUENZ_MUEDE)
    out.push({
      stufe: "gelb",
      titel: "Zielgruppe müde",
      warum: `Jede Person hat die Anzeige ${frequenz.toLocaleString("de-DE", { maximumFractionDigits: 1 })}-mal gesehen.`,
      tipp: "Neues Creative einwechseln oder die Zielgruppe erweitern.",
    });

  if (zielgruppeTeuer && !out.some((b) => b.titel === "Teurer als der Schnitt"))
    out.push({
      stufe: "gelb",
      titel: "Teure Zielgruppe",
      warum: `CPM ${EUR.format(cpm!)}, die anderen Kampagnen zahlen ${EUR.format(u.cpm!)}.`,
      tipp: "Region oder Alter erweitern, Advantage+-Platzierungen freigeben.",
    });

  // Trend: die Woche gegen den Monat – wird es teurer, ermüdet meist das Creative.
  const cpl7 = costPerResult(c.insights?.last_7d);
  const cpl30 = costPerResult(c.insights?.last_30d);
  if (period !== "today" && cpl7 !== undefined && cpl30 !== undefined && (results(c.insights?.last_7d) ?? 0) >= 2 && cpl7 > TREND_SCHLECHTER * cpl30)
    out.push({
      stufe: "gelb",
      titel: "Wird teurer",
      warum: `${EUR.format(cpl7)} je Lead in den letzten 7 Tagen, ${EUR.format(cpl30)} im Monat.`,
      tipp: "Das Creative nutzt sich ab – Motiv oder Text auffrischen, bevor die Leads ausbleiben.",
    });

  return out;
}

/** Die Stufe einer Kampagne: rot schlägt gelb; ohne Befund „ok“, ohne Urteil (nicht aktiv) undefined. */
export const stufe = (c: Campaign, b: Befund[]): Stufe | "ok" | undefined =>
  c.status !== "ACTIVE" ? undefined : b.some((x) => x.stufe === "rot") ? "rot" : b.length ? "gelb" : "ok";

/** Alle Befunde einer Liste auf einmal, mit dem Median der Liste als Maßstab. */
export function befundeAlle(campaigns: Campaign[], period: Period, jetzt = Date.now()) {
  const u = umfeld(campaigns, period);
  return new Map(campaigns.map((c) => [c.id, befunde(c, period, u, jetzt)]));
}
