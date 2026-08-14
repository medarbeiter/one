/**
 * Was vor dem ersten Aufruf gegen Meta feststehen muss. Bewusst ein eigenes
 * Modul und keine Server Action: derselbe Code läuft im Route Handler, der den
 * Fortschritt streamt, und dürfte dort nicht als Client-Referenz ankommen.
 */
import {
  leadgenTosUrl,
  listCustomers as realListCustomers,
  needsLeadgenTos,
} from "./customers";
import { locationKey, locationProblem } from "./geo";
import { estimateReach as realEstimateReach } from "./geo-search";
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
  return (
    s.ads.some((a) => a.type === "ugc" || a.type === "single") &&
    filled(s.bodies) < 2 &&
    filled(s.titles) < 2
  );
}

export type Resolved = { error: string } | { adAccount: string; pageId: string };

/**
 * Der einzige Weg, eine getippte Adresse vor dem Anlegen zu prüfen: Meta selbst
 * fragen. Ohne Treffer schätzt delivery_estimate nichts (estimate_ready fehlt) –
 * und genau so verhält sich später die Anzeigengruppe: sie entsteht, sie läuft,
 * sie liefert an niemanden. Ein Tippfehler in der Straße kostet damit heute
 * einen Tag Laufzeit, nicht eine Meldung.
 *
 * Gleiche Standorte werden einmal geprüft, nicht je Anzeigengruppe. Und ein
 * Fehler der Prüfung selbst hält nichts auf: dass wir gerade nicht nachsehen
 * können, ist kein Befund über die Adresse.
 */
async function unresolvableLocation(
  adSets: AdSetInput[],
  adAccount: string,
  deps: ResolveLaunchDeps,
): Promise<string | undefined> {
  const estimateReach = deps.estimateReach ?? realEstimateReach;
  const seen = new Map<string, boolean>();

  for (const s of adSets) {
    const key = locationKey(s);
    if (!seen.has(key)) {
      try {
        const reach = await estimateReach(adAccount, s);
        seen.set(key, reach.ready);
      } catch {
        seen.set(key, true);
      }
    }
    if (!seen.get(key))
      return (
        `„${s.name}“: Meta findet zu „${s.place?.name ?? s.addressString}“ keine Zielgruppe. ` +
        `Eine Anzeigengruppe darauf würde angelegt, aber an niemanden ausliefern — ` +
        `prüfe die Schreibweise, oder wähle den Ort aus der Vorschlagsliste.`
      );
  }
  return undefined;
}

export type ResolveLaunchDeps = {
  listCustomers?: typeof realListCustomers;
  estimateReach?: typeof realEstimateReach;
};

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

  // Die einzige Bedingung hier, die nicht aus der Eingabe kommt, sondern von
  // Meta gelesen ist – und sie muss vor dem ersten Schreibzugriff stehen. Sonst
  // fällt sie erst beim Creative auf: Kampagne und alle Anzeigengruppen sind
  // dann angelegt, jede Anzeige scheitert, und der Retry in der Receipt hilft
  // nicht, weil sich am Zustand der Seite durch Wiederholen nichts ändert.
  if (needsLeadgenTos(client.page))
    return {
      error:
        `„${client.page.name}“ hat Metas Nutzungsbedingungen für Lead-Anzeigen nicht angenommen — ` +
        `ohne sie lehnt Meta jede Anzeige dieser Seite ab. Ein Administrator der Seite nimmt sie ` +
        `unter ${leadgenTosUrl(client.page.id)} an; über die API ist das nicht möglich.`,
    };

  // Nur Konten aus dem Portfolio: die Liste im Wizard ist eine Anzeige, keine
  // Zusicherung, und ein POST kann jede ID behaupten.
  const known = new Set(customers.flatMap((c) => c.adAccounts.map((a) => a.id)));
  const adAccount = input.adAccount;
  if (!adAccount) return { error: "Wähle das Werbekonto, das diese Kampagne bezahlt." };
  if (!known.has(adAccount)) return { error: "Dieses Werbekonto gehört nicht zum Portfolio." };

  if (!input.adSets.length) return { error: "Füge mindestens eine Anzeigengruppe hinzu." };
  for (const s of input.adSets) {
    // Vor allem anderen: buildTargeting() wirft dieselbe Prüfung erst beim
    // Anlegen der Anzeigengruppe – dann steht die Kampagne schon bei Meta und
    // ein zu kleiner Radius kostet einen Retry statt einer Meldung.
    const location = locationProblem(s);
    if (location) return { error: `„${s.name}“: ${location}` };
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
        error: `„${s.name}“ braucht einen zweiten Primärtext oder eine zweite Überschrift — Meta lehnt eine Anzeige mit einem einzelnen Motiv und nur je einem Text ab.`,
      };
  }
  if (input.spendCapCents !== undefined && input.spendCapCents < 10000)
    return { error: "Das Ausgabenlimit muss mindestens 100 € betragen." };

  const badLocation = await unresolvableLocation(input.adSets, adAccount, deps);
  if (badLocation) return { error: badLocation };

  return { adAccount, pageId: client.page.id };
}
