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

export type AssignDeps = {
  listAssets: () => Promise<{ accounts: PortfolioAsset[]; pages: PortfolioAsset[] }>;
  listAssigned: (edge: "assigned_pages" | "assigned_ad_accounts") => Promise<AssignedAsset[]>;
  assign: (assetId: string) => Promise<void>;
  /** Nur für Tests – sonst Date.now(). */
  now?: () => number;
};

export type Reconciliation = {
  assigned: PortfolioAsset[];
  failed: { asset: PortfolioAsset; message: string }[];
  /** Fehlend, aber übersprungen, weil in diesem Prozess schon gescheitert. */
  skipped: number;
};

/** Der Merker verfällt nach einer Stunde – das fängt Entzüge außerhalb der App ab. */
const TTL = 60 * 60 * 1000;

export function createAssigner(deps: AssignDeps, ttl = TTL) {
  let ready: Set<string> | null = null;
  let primedAt = 0;
  let running: Promise<Reconciliation> | null = null;
  const parked = new Set<string>();

  const now = () => deps.now?.() ?? Date.now();

  async function prime() {
    const [pages, accounts] = await Promise.all([
      deps.listAssigned("assigned_pages"),
      deps.listAssigned("assigned_ad_accounts"),
    ]);
    // Erst nach beiden gelungenen Lesungen setzen: ein halber Ist-Zustand ließe
    // den Abgleich zuweisen, was längst zugewiesen ist.
    ready = new Set([...readyIds(pages), ...readyIds(accounts)]);
    primedAt = now();
  }

  async function reconcile(force: boolean): Promise<Reconciliation> {
    if (force || !ready || now() - primedAt >= ttl) {
      if (force) parked.clear();
      await prime();
    }
    // listAssets() trifft denselben Fetch-Cache, den das Layout eben gefüllt
    // hat – der Portfolio-Teil kostet hier nichts.
    const { accounts, pages } = await deps.listAssets();
    const missing = missingAssets([...pages, ...accounts], ready!);
    const todo = missing.filter((a) => !parked.has(a.id));

    const out: Reconciliation = {
      assigned: [],
      failed: [],
      skipped: missing.length - todo.length,
    };
    for (const asset of todo) {
      try {
        await deps.assign(asset.id);
        ready!.add(asset.id);
        out.assigned.push(asset);
      } catch (e) {
        parked.add(asset.id);
        out.failed.push({ asset, message: (e as Error).message });
      }
    }
    return out;
  }

  return {
    /**
     * Ein Lauf zur Zeit. Parallele Renderings teilen sich denselben, sonst
     * schreiben sie dieselbe Zuweisung mehrfach.
     */
    run(force = false): Promise<Reconciliation> {
      if (running && !force) return running;
      const started = reconcile(force).finally(() => {
        if (running === started) running = null;
      });
      running = started;
      return started;
    },
  };
}
