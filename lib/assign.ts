/**
 * Zuweisungen an den System-Nutzer – abgeglichen, nicht blind geschrieben.
 *
 * Der Ist-Zustand kommt gebündelt über zwei Edges des System-Nutzers. Ein Blick
 * pro Asset wäre dieselbe Auskunft für knapp 200 Aufrufe.
 */
import { listAssets } from "./customers";
import { graph } from "./graph";

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

/**
 * Zuweisungen wirken pro System-Nutzer, und META_ACCESS_TOKEN gehört genau
 * einem davon. Deshalb /me: der Token sagt selbst, wer er ist. Träfe es den
 * falschen Nutzer, liefe der Abgleich grün durch, während die App weiter
 * „(#10) User has insufficient privileges on the page“ bekäme.
 */
let user: Promise<string> | undefined;

export function systemUser(): Promise<string> {
  const fromEnv = process.env.META_SYSTEM_USER_ID;
  if (fromEnv) return Promise.resolve(fromEnv);
  return (user ??= graph<{ id: string }>("me", { params: { fields: "id" } })
    .then((m) => m.id)
    .catch((e) => {
      user = undefined; // sonst brennt ein einmaliger Fehlschlag ein
      throw e;
    }));
}

export const realDeps: AssignDeps = {
  listAssets: async () => {
    const { accounts, pages } = await listAssets();
    return { accounts, pages };
  },
  listAssigned: async (edge) => {
    const { data } = await graph<{ data: AssignedAsset[] }>(`${await systemUser()}/${edge}`, {
      params: { fields: "id,tasks", limit: 500 },
    });
    return data;
  },
  assign: async (id) => {
    await graph(`${id}/assigned_users`, {
      method: "POST",
      params: { user: await systemUser(), tasks: [TASK] },
    });
  },
};

export const assigner = createAssigner(realDeps);

/**
 * Auslöser für das Layout. Wirft nie: der Abgleich läuft in after(), die Antwort
 * ist längst raus, und ein Graph-Aussetzer darf keine Seite zerlegen.
 */
export async function ensureAssigned(): Promise<void> {
  try {
    const { assigned, failed } = await assigner.run();
    for (const a of assigned) console.log(`[assign] zugewiesen: ${a.name} (${a.id})`);
    for (const f of failed)
      console.error(`[assign] fehlgeschlagen: ${f.asset.name} (${f.asset.id}): ${f.message}`);
  } catch (e) {
    console.error(`[assign] Abgleich nicht möglich: ${(e as Error).message}`);
  }
}
