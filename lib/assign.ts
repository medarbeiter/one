/**
 * Zuweisungen an den System-Nutzer – abgeglichen, nicht blind geschrieben.
 *
 * Der Ist-Zustand kommt gebündelt über zwei Edges des System-Nutzers. Ein Blick
 * pro Asset wäre dieselbe Auskunft für knapp 200 Aufrufe.
 */

/** MANAGE = Vollzugriff, deckt Anzeigen, Inhalte und Nachrichten ab. */
export const TASK = "MANAGE";

export type AssignedAsset = { id: string; tasks?: string[] };
export type PortfolioAsset = { id: string; name: string };

/**
 * `tasks` kommt im selben Aufruf mit wie die Id und kostet nichts extra. Deshalb
 * prüft der Abgleich nicht nur „steht in der Liste“, sondern „steht mit MANAGE
 * darin“ – eine Seite mit bloßem ANALYZE sieht sonst zugewiesen aus und lehnt
 * jede Anzeige ab.
 */
export const readyIds = (assigned: AssignedAsset[]) =>
  new Set(assigned.filter((a) => a.tasks?.includes(TASK)).map((a) => a.id));

export const missingAssets = (portfolio: PortfolioAsset[], ready: Set<string>) =>
  portfolio.filter((a) => !ready.has(a.id));
