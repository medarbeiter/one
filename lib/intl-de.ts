/**
 * Deutsch als Vorgabe für `Intl.DateTimeFormat`.
 *
 * Astryx formatiert Datumsangaben in Kalender, DateInput und Timestamp mit
 * `new Intl.DateTimeFormat(undefined, …)` (siehe `utils/plainDate.ts` im
 * Paket). `undefined` heißt „nimm die Vorgabe der Laufzeit" — und die ist auf
 * dem Server die Systemsprache der Maschine, im Browser die des Nutzers. Beide
 * sind selten dieselbe. Die Folge war doppelt schlecht:
 *
 *   1. Der Server lieferte `aria-label="Sunday, July 26, 2026"`, der Browser
 *      ersetzte es beim Hydrieren durch „Sonntag, 26. Juli 2026" — React warf
 *      auf jeder Seite mit Datumsfeld einen Hydration-Mismatch.
 *   2. Wer einen englisch eingestellten Browser benutzt, bekam im Kalender
 *      englische Wochentage — in einer Anwendung, deren erste Regel „nur
 *      Deutsch" lautet.
 *
 * Die Anwendung kennt genau eine Sprache. Deshalb wird die Vorgabe hier fest
 * auf `de-DE` gelegt, statt sie der Laufzeit zu überlassen: ein ausdrücklich
 * mitgegebenes Gebietsschema gewinnt weiterhin, nur das leere `undefined`
 * bekommt eine Antwort. Damit stimmen Server und Browser überein, und beide
 * sprechen Deutsch.
 *
 * Bewusst nur `DateTimeFormat`: das ist die Stelle, an der der Fehler auftrat.
 * Zahlen und Beträge formatiert `lib/format.ts` von Hand.
 *
 * Wird auf beiden Seiten genau einmal ausgeführt — vom Wurzel-Layout (Server)
 * und von `components/intl-de-client.tsx` (Browser).
 */

const ZIEL = 'de-DE';

declare global {
  // eslint-disable-next-line no-var
  var __medarbeiterIntlDeutsch: boolean | undefined;
}

if (!globalThis.__medarbeiterIntlDeutsch) {
  globalThis.__medarbeiterIntlDeutsch = true;

  const Original = Intl.DateTimeFormat;

  function MitDeutschAlsVorgabe(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    // `new Original(…)` gibt ein echtes DateTimeFormat zurück; weil ein
    // Konstruktor, der ein Objekt zurückgibt, dieses statt `this` liefert,
    // funktioniert der Aufruf mit und ohne `new` — beides ist erlaubt.
    return new Original(locales ?? ZIEL, options);
  }

  // `prototype` und `supportedLocalesOf` mitnehmen, damit `instanceof` und die
  // statische Abfrage weiterhin das tun, was sie sollen.
  MitDeutschAlsVorgabe.prototype = Original.prototype;
  MitDeutschAlsVorgabe.supportedLocalesOf = Original.supportedLocalesOf.bind(Original);

  Intl.DateTimeFormat = MitDeutschAlsVorgabe as unknown as typeof Intl.DateTimeFormat;
}

export {};
