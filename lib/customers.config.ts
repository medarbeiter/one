/**
 * Nur, was ein Mensch entschieden hat. Alles Ableitbare kommt aus dem Portfolio
 * (lib/derive.ts) – die Vorgängerversion dieser Datei war eine erzeugte Kopie
 * des Portfolios und zeigte zuletzt mit 48 von 215 Einträgen ins Leere.
 *
 * Schlüssel ist die Seiten-Id, bei kontenbasierten Kunden die act_-Id. Beide
 * ändern sich nicht, Namen schon.
 *
 * Eine feste Id hält eine URL am Leben, die schon jemand kennt. Sonst gilt: die
 * abgeleitete Id ist die richtige – ein Eintrag hier muss sich rechtfertigen.
 * `bun run customers` zeigt, welcher das nicht mehr tut.
 */
import type { CustomerOverride } from "./customers";

export const overrides: Record<string, CustomerOverride> = {
  // payers() sortiert den eigenen Zahler nach vorn und prüft dafür auf diese Id.
  // Ohne die Zeile hinge sie am Namen des Werbekontos.
  act_5475637912552784: { id: "medarbeiter" },

  // Ids aus der Zeit der erzeugten Config: dort auf 24 Zeichen gekappt und um
  // Rechtsformen gekürzt, hier von Hand richtiggestellt. Sie bleiben, weil sie
  // in Lesezeichen stehen – abgeleitet hießen dieselben Kunden heute anders.
  "875948942260994": { id: "kbssabinemarxgmbh" }, // KBS Pflegeteam Sabine Marx GmbH
  "101877271400716": { id: "caritasstmichael" }, // Caritas Altenpflegeheim St. Michael Dresden
  "641905719566986": { id: "caritasstjoseph" }, // Caritas Altenpflegeheim St. Joseph Rathmannsdorf
  "427851957068178": { id: "schroeterambulant" }, // Ambulanter Pflegedienst Schröter
  "466863809837081": { id: "pflegebetreuungpretzsch" }, // Pflege- und Betreuungsdienst Pretzsch
  "504631706405466": { id: "pflegebetreuungmueller" }, // Pflege- und Betreuungsdienst Müller GmbH
  // Zwei Seiten heißen „ASB Coburg“; die Ableitung vergibt hier „asbcoburg-2“.
  "114838818691479": { id: "asbcoburg2" }, // ASB Coburg
};
