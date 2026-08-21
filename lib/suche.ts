/**
 * Die Suche über das ganze Haus: ein Feld, das Wege und Kunden findet.
 *
 * 1:1 im Aufbau aus dem Hub übernommen (lib/suche.ts dort), nur mit dem
 * Bestand dieses Hauses gefüllt. Der Zuschnitt geschieht auf dem Server, nicht
 * im Browser: eine Suche, die clientseitig filtert, hat die Antwort vorher
 * schon ausgeliefert. Hier ist das kein Geheimnisschutz – die Kundenliste
 * steht ohnehin auf `/customers` –, sondern eine Größenfrage: über 200 Kunden
 * mit ihren Konten in jedes Bündel zu legen, um dann sechs davon zu zeigen,
 * wäre Verschwendung an jeder Tastatureingabe.
 *
 * Jede Zeile kommt fertig sortiert und mit ihrer Adresse; die Palette tippt,
 * zeichnet und navigiert nur (app/shell/suche.tsx).
 */
import { fuzzyCustomerMatch, instagramAccountLabel, listCustomers } from "./customers";
import type { Meaning } from "@/theme/icons";

export type Treffer = {
  /** Kennung der Zeile – die Palette gibt beim Auswählen nur sie zurück. */
  id: string;
  label: string;
  /** Die Überschrift, unter der die Zeile in der Palette steht. */
  gruppe: string;
  /** Was diese Zeile von ihren Geschwistern unterscheidet. */
  zusatz?: string;
  href: string;
  meaning: Meaning;
};

/**
 * Die Wege sind kein Suchindex, sondern die Navigation selbst – dieselben
 * Ziele wie in der Seitenleiste (app/shell/sidebar.tsx), plus die eine
 * Handlung, die von überall aus dran ist. Sie stehen zuerst: wer „kamp" tippt,
 * will meistens auf die Kampagnenliste und nicht zu einem Kunden, der zufällig
 * so heißt.
 */
const WEGE: Array<{ label: string; href: string; meaning: Meaning; zusatz?: string }> = [
  { label: "Heute", href: "/", meaning: "today" },
  { label: "Inbox", href: "/inbox", meaning: "inbox" },
  { label: "Kampagnen", href: "/campaigns", meaning: "campaign" },
  { label: "Kunden", href: "/customers", meaning: "customers" },
  { label: "Neue Kampagne", href: "/campaigns/new", meaning: "add", zusatz: "Assistent" },
];

/** Wie viele Zeilen eine Gruppe höchstens beisteuert, solange alle gefragt sind. */
const JE_GRUPPE = 5;

/**
 * Sucht. Ein leerer Wortlaut ist keine leere Antwort: er ist die Frage „was
 * gibt es hier", und darauf sind die Wege die Antwort.
 *
 * `bereich` schneidet auf eine Gruppe zu – dann fällt die Grenze je Gruppe weg,
 * weil es nur noch eine gibt.
 */
export async function suche(frage: string, bereich?: string): Promise<Treffer[]> {
  const wort = frage.trim();
  const grenze = bereich ? Infinity : JE_GRUPPE;

  const wege: Treffer[] = WEGE.filter(
    (w) => wort === "" || fuzzyCustomerMatch(w.label, wort),
  ).map((w) => ({ ...w, id: `weg:${w.href}`, gruppe: "Wege" }));

  // Ohne Wortlaut wird kein Kundenbestand geladen: das leere Blatt soll sofort
  // stehen, und ein Graph-Aufruf je Öffnen der Palette wäre teuer für nichts.
  // Und wer auf eine andere Gruppe zugeschnitten hat, bekommt die Kunden
  // hinterher ohnehin weggeschnitten – dann gar nicht erst holen.
  let kunden: Treffer[] = [];
  if (wort !== "" && (!bereich || bereich === "Kunden")) {
    // Ein toter Token darf die Suche nicht sprengen – dann findet sie eben nur
    // Wege. Sie ist nie der einzige Weg zu einem Kunden.
    const { customers } = await listCustomers().catch(() => ({ customers: [] }));
    kunden = customers
      .filter((c) => fuzzyCustomerMatch(c.name, wort))
      .map((c) => ({
        id: `kunde:${c.id}`,
        label: c.name,
        gruppe: "Kunden",
        zusatz:
          [c.page?.name, instagramAccountLabel(c.instagram)].filter(Boolean).join(" · ") ||
          undefined,
        href: `/customers/${c.id}`,
        meaning: "customer" as const,
      }));
  }

  const gruppen: Array<[string, Treffer[]]> = [
    ["Wege", wege],
    ["Kunden", kunden],
  ];
  return gruppen
    .filter(([name]) => !bereich || bereich === name)
    .flatMap(([, zeilen]) => zeilen.slice(0, grenze));
}
