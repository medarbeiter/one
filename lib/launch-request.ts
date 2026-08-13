/**
 * Was vor dem ersten Aufruf gegen Meta feststehen muss. Bewusst ein eigenes
 * Modul und keine Server Action: derselbe Code läuft im Route Handler, der den
 * Fortschritt streamt, und dürfte dort nicht als Client-Referenz ankommen.
 */
import { listCustomers as realListCustomers } from "./customers";
import type { AdSetInput, LaunchInput, LaunchProgress, Receipt } from "./launch";
import type { Check } from "./verify";

export type WizardSubmission = Omit<LaunchInput, "adAccount" | "pageId"> & {
  /** Der beworbene Kunde – seine Seite trägt Anzeigen und Formulare. */
  clientId: string;
  adAccount: string;
};

/**
 * Eine Zeile des Fortschritt-Streams von app/api/launch. Der Typ steht hier und
 * nicht im Route Handler, damit der Client ihn lesen kann, ohne ein Modul zu
 * importieren, das nur auf dem Server laufen darf.
 */
export type LaunchEvent =
  | ({ type: "progress" } & LaunchProgress)
  | { type: "result"; receipt?: Receipt; checks?: Check[]; error?: string };

/**
 * Dieselbe Bedingung wie needsSecondText in app/campaigns/new/state.ts, hier
 * bewusst kopiert statt importiert: das Original steht in einem "use client"-
 * Modul, dessen Exporte auf dem Server nur noch Client-Referenzen sind, und es
 * ist auf WizardAdSet typisiert – dessen Anzeigen tragen die Assistenten-IDs,
 * die über die Server Action gar nicht ankommen. Drei Zeilen doppelt sind
 * billiger als ein geteiltes Modul für ein Prädikat.
 */
function needsSecondText(s: AdSetInput): boolean {
  const filled = (xs: string[]) => xs.filter((x) => x.trim()).length;
  return s.ads.some((a) => a.type === "ugc") && filled(s.bodies) < 2 && filled(s.titles) < 2;
}

export type Resolved = { error: string } | { adAccount: string; pageId: string };

export type ResolveLaunchDeps = { listCustomers?: typeof realListCustomers };

/**
 * Konto und Seite werden hier neu aufgelöst, nicht vom Client übernommen –
 * sonst zeigt ein manipuliertes Feld auf ein fremdes Konto oder eine fremde
 * Seite. Beide sind unabhängig voneinander: MedArbeiter zahlt, die Seite des
 * beworbenen Kunden veröffentlicht.
 *
 * deps.listCustomers ist wie LaunchDeps in launch.ts nur ein Testkanal: echte
 * Aufrufer lassen ihn weg und bekommen die echte, netzwerkgebundene Funktion.
 * Ohne diesen Einstiegspunkt bräuchte ein Test dieser Datei entweder einen
 * echten Meta-Token oder ein prozessweites Modul-Mock – Letzteres hat hier
 * einmal lib/customers.test.ts kaputtgemacht, weil bun test alle Testdateien
 * im selben Prozess ausführt und der Mock über die Datei hinaus wirkte.
 */
export async function resolveLaunch(
  input: WizardSubmission,
  deps: ResolveLaunchDeps = {},
): Promise<Resolved> {
  const listCustomers = deps.listCustomers ?? realListCustomers;
  const { customers } = await listCustomers();

  const client = customers.find((c) => c.id === input.clientId);
  if (!client?.page)
    return { error: "Wähle den beworbenen Kunden — seine Seite trägt die Anzeigen und Formulare." };

  // Nur Konten aus dem Portfolio: die Liste im Wizard ist eine Anzeige, keine
  // Zusicherung, und ein POST kann jede ID behaupten.
  const known = new Set(customers.flatMap((c) => c.adAccounts.map((a) => a.id)));
  const adAccount = input.adAccount;
  if (!adAccount) return { error: "Wähle das Werbekonto, das diese Kampagne bezahlt." };
  if (!known.has(adAccount)) return { error: "Dieses Werbekonto gehört nicht zum Portfolio." };

  if (!input.adSets.length) return { error: "Füge mindestens eine Anzeigengruppe hinzu." };
  for (const s of input.adSets) {
    if (!s.ads.length) return { error: `„${s.name}“ hat noch keine Anzeigen.` };
    if (!s.formId) return { error: `„${s.name}“ hat kein Lead-Formular ausgewählt.` };
    // Eine halbe Split-Anzeige ist ein offener Zustand aus dem Assistenten und
    // kein Fehler von Meta: ohne beide Hälften deckt die zweite
    // Platzierungsregel nichts ab. Hier abfangen, solange noch nichts angelegt
    // ist – sonst steht die Kampagne halb bei Meta und der Fehler kommt als
    // Graph-Meldung zurück.
    if (s.ads.some((a) => a.type === "split" && !(a.portrait && a.square)))
      return { error: `„${s.name}“ hat eine Anzeige, der noch die Hochformat- oder Quadrat-Hälfte fehlt.` };
    // buildCreative() verlangt für jede Anzeigengruppe mindestens einen
    // Primärtext und eine Überschrift, unabhängig vom Anzeigentyp –
    // needsSecondText() unten prüft nur UGC. Eine reine Split-Gruppe ohne Text
    // rutscht sonst hier vorbei und wirft erst bei Meta, wenn Kampagne und
    // Anzeigengruppe schon angelegt sind.
    if (!s.bodies.length || !s.titles.length)
      return { error: `„${s.name}“ braucht mindestens einen Primärtext und eine Überschrift.` };
    // Derselbe Grenzwert wie buildCreative(); dort nur die letzte Verteidigung.
    // Im Assistenten hält MAX_ITEMS das ein, aber ein POST an /api/launch geht
    // am Assistenten vorbei und damit auch an dessen Begrenzung.
    if (s.bodies.length > 5 || s.titles.length > 5)
      return {
        error: `„${s.name}“ hat mehr als fünf Primärtexte oder Überschriften — Meta erlaubt höchstens fünf.`,
      };
    if (needsSecondText(s))
      return {
        error: `„${s.name}“ braucht einen zweiten Primärtext oder eine zweite Überschrift — Meta lehnt eine UGC-Anzeige mit nur je einem ab.`,
      };
  }
  if (input.spendCapCents !== undefined && input.spendCapCents < 10000)
    return { error: "Das Ausgabenlimit muss mindestens 100 € betragen." };

  return { adAccount, pageId: client.page.id };
}
