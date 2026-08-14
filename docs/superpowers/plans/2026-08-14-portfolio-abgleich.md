# Portfolio-Abgleich – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Ziel:** Zuweisungen an den System-Nutzer und die Kundenliste gleichen sich beim
Rendern selbst ab, statt auf zwei von Hand gestartete Skripte zu warten – bei
null zusätzlichen API-Aufrufen im Normalbetrieb.

**Architektur:** Zwei reine Kerne mit injizierten Abhängigkeiten
(`lib/assign.ts`, `lib/derive.ts`), je eine dünne Schicht darüber, die sie an
`lib/graph.ts` bindet. Ausgelöst wird beides von `app/layout.tsx`, das ohnehin
bei jedem Seitenaufruf rendert – die Zuweisung nachgelagert über `after()`, die
Kundenableitung direkt in `listCustomers()`, weil sie keine eigenen Aufrufe
kostet. Die beiden Skripte bleiben als lauter Weg von Hand bestehen.

**Tech-Stack:** Bun 1.3.14, `bun:test`, Next.js 16.3 (App Router,
`output: "standalone"`), TypeScript, Meta Graph API v26.0.

**Spec:** `docs/superpowers/specs/2026-08-14-portfolio-abgleich-design.md` –
enthält die Messwerte, auf denen jede Entscheidung hier beruht. Vor Task 1 lesen.

## Globale Vorgaben

- **Sprache:** Kommentare, Commit-Nachrichten und Testnamen auf Deutsch, wie im
  ganzen Repo. Kommentare begründen, warum etwas so ist, statt zu wiederholen,
  was der Code sagt.
- **Tests:** `bun test <datei>` – kein Vitest, kein Jest. `bun test` führt **alle
  Testdateien im selben Prozess** aus; prozessweite Modul-Mocks wirken über die
  Datei hinaus und haben hier schon einmal `lib/customers.test.ts` zerlegt.
  Deshalb ausschließlich injizierte Abhängigkeiten (Muster: `deps.listCustomers`
  in `lib/launch-request.ts:89`, `createGate` in `lib/gate.ts:20`).
- **Kein Netz im Test.** Kein Test darf `graph()` erreichen.
- **Typprüfung:** `bunx tsc --noEmit` muss am Ende jeder Task grün sein.
- **Zuweisungs-Task:** `MANAGE`. Nicht ändern – Begründung in der Spec unter
  „Offene Punkte“.
- **Kundenzuweisung:** `MANAGE_LEADS` wird bewusst **nicht** angefordert.
- **Nach jeder Task committen.** Kein Sammelcommit über mehrere Tasks.

## Dateiübersicht

| Datei | Rolle |
|---|---|
| `lib/assign.ts` (neu) | Reiner Abgleich + Merker + Bindung an Graph |
| `lib/assign.test.ts` (neu) | Tests dazu, mit gefälschten Deps |
| `lib/derive.ts` (neu) | Reine Ableitung des Kunden aus dem Portfolio |
| `lib/derive.test.ts` (neu) | Tests dazu |
| `lib/customers.ts` | Verliert `joinCustomers`, bekommt `applyOverrides`; `normalise` zieht nach `derive.ts` |
| `lib/customers.config.ts` | Von 1351 Zeilen erzeugter Daten auf Overrides |
| `app/layout.tsx` | Auslöser `after(ensureAssigned)`, Issues aus Overrides |
| `scripts/assign-assets.ts` | Ruft den gemeinsamen Abgleich mit `force` |
| `scripts/customers.ts` | Vom Generator zum Doktor |
| `README.md:54` | Der Satz „Nach jedem neuen Kunden erneut laufen lassen“ stimmt nicht mehr |

Warum `lib/derive.ts` eine eigene Datei ist, obwohl die Spec die Ableitung in
`lib/customers.ts` verortet: `customers.ts` hat 216 Zeilen und mischt schon
Netzzugriff mit Zusammenbau. Die Ableitung ist rein und gut allein testbar; sie
dort hineinzulegen ergäbe eine Datei um 350 Zeilen mit zwei Zuständigkeiten.
`customers.ts` importiert sie und behält seine Schnittstelle nach außen.

---

# Teil 1 – Zuweisungen

## Task 1: Der reine Kern des Abgleichs

**Dateien:**
- Create: `lib/assign.ts`
- Test: `lib/assign.test.ts`

**Schnittstellen:**
- Produces: `TASK: "MANAGE"`, `type AssignedAsset = { id: string; tasks?: string[] }`,
  `type PortfolioAsset = { id: string; name: string }`,
  `readyIds(assigned: AssignedAsset[]): Set<string>`,
  `missingAssets(portfolio: PortfolioAsset[], ready: Set<string>): PortfolioAsset[]`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

`lib/assign.test.ts`:

```ts
/**
 * Der Abgleich entscheidet, was geschrieben wird. Ein zu großzügiges "gilt als
 * zugewiesen" heißt: die App kann die Seite nicht benutzen und merkt es nie.
 */
import { expect, test } from "bun:test";
import { missingAssets, readyIds } from "./assign";

const asset = (id: string) => ({ id, name: id });

test("zugewiesen ist nur, wer MANAGE hat", () => {
  const ready = readyIds([
    { id: "a", tasks: ["MANAGE", "ADVERTISE"] },
    { id: "b", tasks: ["ANALYZE"] },
    { id: "c" },
  ]);
  expect([...ready]).toEqual(["a"]);
});

test("was nicht zugewiesen ist, bleibt übrig – und nur das", () => {
  const missing = missingAssets([asset("a"), asset("b"), asset("c")], new Set(["a"]));
  expect(missing.map((m) => m.id)).toEqual(["b", "c"]);
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag prüfen**

Run: `bun test lib/assign.test.ts`
Expected: FAIL – `Cannot find module './assign'`

- [ ] **Schritt 3: Minimale Implementierung**

`lib/assign.ts`:

```ts
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
```

- [ ] **Schritt 4: Tests laufen lassen**

Run: `bun test lib/assign.test.ts`
Expected: PASS (2 Tests)

- [ ] **Schritt 5: Committen**

```bash
git add lib/assign.ts lib/assign.test.ts
git commit -m "feat: der Zuweisungsabgleich weiß, was fehlt"
```

---

## Task 2: Merker, Parken, ein Lauf zur Zeit

**Dateien:**
- Modify: `lib/assign.ts`
- Modify: `lib/assign.test.ts`

**Schnittstellen:**
- Consumes: `readyIds`, `missingAssets`, `PortfolioAsset`, `AssignedAsset` (Task 1)
- Produces:
  - `type AssignDeps = { listAssets: () => Promise<{ accounts: PortfolioAsset[]; pages: PortfolioAsset[] }>; listAssigned: (edge: "assigned_pages" | "assigned_ad_accounts") => Promise<AssignedAsset[]>; assign: (assetId: string) => Promise<void>; now?: () => number }`
  - `type Reconciliation = { assigned: PortfolioAsset[]; failed: { asset: PortfolioAsset; message: string }[]; skipped: number }`
  - `createAssigner(deps: AssignDeps, ttl?: number): { run(force?: boolean): Promise<Reconciliation> }`

- [ ] **Schritt 1: Fehlschlagende Tests schreiben**

An `lib/assign.test.ts` anhängen:

```ts
import { createAssigner, type AssignDeps } from "./assign";

/** Ein Portfolio, ein Ist-Zustand, ein Protokoll – mehr braucht der Abgleich nicht. */
function fake(portfolio: string[], assigned: string[], breaks: string[] = []) {
  const calls = { reads: 0, writes: [] as string[] };
  let clock = 0;
  const deps: AssignDeps = {
    listAssets: async () => ({ accounts: [], pages: portfolio.map((id) => ({ id, name: id })) }),
    listAssigned: async () => {
      calls.reads++;
      return assigned.map((id) => ({ id, tasks: ["MANAGE"] }));
    },
    assign: async (id) => {
      calls.writes.push(id);
      if (breaks.includes(id)) throw new Error(`(#10) keine Freigabe für ${id}`);
    },
    now: () => clock,
  };
  return { deps, calls, tick: (ms: number) => (clock += ms) };
}

test("nur das Fehlende wird geschrieben", async () => {
  const { deps, calls } = fake(["a", "b"], ["a"]);
  const out = await createAssigner(deps).run();
  expect(calls.writes).toEqual(["b"]);
  expect(out.assigned.map((a) => a.id)).toEqual(["b"]);
  // Zwei Edges, ein Lauf: der Ist-Zustand kostet zwei Aufrufe, nicht 200.
  expect(calls.reads).toBe(2);
});

test("der zweite Lauf liest den Ist-Zustand nicht erneut", async () => {
  const { deps, calls } = fake(["a", "b"], ["a"]);
  const assigner = createAssigner(deps);
  await assigner.run();
  await assigner.run();
  // Erste Runde schreibt b, zweite weiß es bereits – ohne einen einzigen Aufruf.
  expect(calls.writes).toEqual(["b"]);
  expect(calls.reads).toBe(2);
});

test("nach Ablauf des Merkers wird neu gelesen", async () => {
  const { deps, calls, tick } = fake(["a"], ["a"]);
  const assigner = createAssigner(deps, 1000);
  await assigner.run();
  tick(1000);
  await assigner.run();
  expect(calls.reads).toBe(4);
  expect(calls.writes).toEqual([]);
});

test("ein Fehlschlag wird nicht wiederholt", async () => {
  const { deps, calls } = fake(["a"], [], ["a"]);
  const assigner = createAssigner(deps);
  const first = await assigner.run();
  const second = await assigner.run();
  expect(first.failed.map((f) => f.asset.id)).toEqual(["a"]);
  // Ohne das Parken kostete eine Seite ohne Freigabe bei jedem Seitenaufruf
  // einen POST, und zwar dauerhaft.
  expect(calls.writes).toEqual(["a"]);
  expect(second.skipped).toBe(1);
});

test("force liest neu und vergisst Geparktes", async () => {
  const { deps, calls } = fake(["a"], [], ["a"]);
  const assigner = createAssigner(deps);
  await assigner.run();
  await assigner.run(true);
  expect(calls.writes).toEqual(["a", "a"]);
  expect(calls.reads).toBe(4);
});

test("parallele Läufe teilen sich einen", async () => {
  const { deps, calls } = fake(["a"], []);
  const assigner = createAssigner(deps);
  await Promise.all([assigner.run(), assigner.run(), assigner.run()]);
  // Sonst schreiben drei gleichzeitige Renderings dieselbe Zuweisung dreimal.
  expect(calls.writes).toEqual(["a"]);
});

test("ohne lesbaren Ist-Zustand wird nichts geschrieben", async () => {
  const { deps, calls } = fake(["a"], []);
  deps.listAssigned = async () => {
    throw new Error("(#10) keine Berechtigung");
  };
  await expect(createAssigner(deps).run()).rejects.toThrow("(#10)");
  // Lieber gar nicht zuweisen als blind alles.
  expect(calls.writes).toEqual([]);
});
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `bun test lib/assign.test.ts`
Expected: FAIL – `createAssigner is not a function`

- [ ] **Schritt 3: Implementierung**

An `lib/assign.ts` anhängen:

```ts
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
```

- [ ] **Schritt 4: Tests laufen lassen**

Run: `bun test lib/assign.test.ts && bunx tsc --noEmit`
Expected: PASS (9 Tests), keine Typfehler

- [ ] **Schritt 5: Committen**

```bash
git add lib/assign.ts lib/assign.test.ts
git commit -m "feat: der Abgleich merkt sich den Ist-Zustand und parkt Fehlschläge"
```

---

## Task 3: Anschluss an Graph und Auslöser im Layout

**Dateien:**
- Modify: `lib/assign.ts`
- Modify: `app/layout.tsx:25-34`

**Schnittstellen:**
- Consumes: `createAssigner` (Task 2), `graph`/`meta` aus `lib/graph.ts`,
  `listAssets` aus `lib/customers.ts`
- Produces: `systemUser(): Promise<string>`, `assigner`, `ensureAssigned(): Promise<void>`

Hier gibt es keinen Test: die Datei besteht aus der Bindung an das Netz, und
genau die darf `bun test` nicht anfassen. Geprüft wird in Task 4 mit dem Skript
gegen das echte Portfolio.

- [ ] **Schritt 1: Bindung schreiben**

An `lib/assign.ts` anhängen (Importe an den Dateikopf):

```ts
import { listAssets } from "./customers";
import { graph } from "./graph";
```

```ts
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
```

- [ ] **Schritt 2: Auslöser im Layout**

`app/layout.tsx` – Importe ergänzen:

```tsx
import { after } from "next/server";
import { ensureAssigned } from "@/lib/assign";
```

In `RootLayout`, direkt nach `const { customers, errors } = await listCustomers();`:

```tsx
  // Neue Kunden weisen sich selbst zu. after() läuft nach der Antwort: der
  // Abgleich hält keine Seite auf, und sein Fehlschlag zerlegt kein Rendering.
  after(ensureAssigned);
```

- [ ] **Schritt 3: Übersetzen und Tests laufen lassen**

Run: `bunx tsc --noEmit && bun test`
Expected: keine Typfehler, alle bestehenden Tests weiter grün

- [ ] **Schritt 4: Gegen das echte Portfolio prüfen**

Run: `bun --env-file=.env.local -e 'import("./lib/assign").then(m => m.assigner.run()).then(r => console.log(r))'`
Expected: `{ assigned: [], failed: [], skipped: 0 }` – der Bestand ist laut Spec
vollständig zugewiesen. Steht dort etwas anderes, **erst klären**, nicht
weiterbauen: entweder ist seit dem 2026-08-14 ein Kunde dazugekommen (dann steht
er namentlich in `assigned`), oder der Abgleich hält Zugewiesenes für fehlend.

- [ ] **Schritt 5: Committen**

```bash
git add lib/assign.ts app/layout.tsx
git commit -m "feat: jeder Seitenaufruf gleicht die Zuweisungen ab"
```

---

## Task 4: Das Skript ruft denselben Abgleich

**Dateien:**
- Modify: `scripts/assign-assets.ts` (vollständig ersetzen)
- Modify: `README.md:52-58`

**Schnittstellen:**
- Consumes: `assigner`, `systemUser` (Task 3), `graph`/`meta` aus `lib/graph.ts`

- [ ] **Schritt 1: Skript ersetzen**

`scripts/assign-assets.ts`:

```ts
/**
 * Der laute Weg von Hand: gleicht ab wie die App, ignoriert aber jeden Merker
 * und berichtet, was passiert ist.
 *   bun run assign
 */
import { assigner, systemUser } from "../lib/assign";
import { graph, meta } from "../lib/graph";

const user = await systemUser();

// Die Prüfung kostet einen Aufruf und bleibt deshalb im Skript: Zuweisungen an
// einen Nutzer, der gar nicht zu diesem Business gehört, laufen grün durch und
// wirken nie.
const { data: users } = await graph<{ data: { id: string; name: string }[] }>(
  `${meta.business}/system_users`,
);
const self = users.find((u) => u.id === user);
if (!self)
  throw new Error(
    `Der Token gehört Nutzer ${user}, der kein System-Nutzer von Business ` +
      `${meta.business} ist. Bekannt sind: ${users.map((u) => `${u.name} (${u.id})`).join(", ")}`,
  );
console.log(`Weise zu an: ${self.name} (${self.id})\n`);

const { assigned, failed } = await assigner.run(true);

for (const a of assigned) console.log(`✓ ${a.name} (${a.id})`);
console.log(`\n${assigned.length} zugewiesen, ${failed.length} fehlgeschlagen`);
for (const f of failed) console.log(`✗ ${f.asset.name} (${f.asset.id}): ${f.message}`);
```

- [ ] **Schritt 2: Skript laufen lassen**

Run: `bun run assign`
Expected: `Weise zu an: …`, dann `0 zugewiesen, 0 fehlgeschlagen`. Der Lauf
kostet jetzt 2 GET + 4 GET statt 193 POST.

- [ ] **Schritt 3: README richtigstellen**

`README.md`, Punkt 4 ersetzen:

```markdown
4. **Assets zuweisen** – passiert von selbst. Beim ersten Seitenaufruf gleicht
   die App ab, welche Werbekonten und Seiten des Portfolios dem System-Nutzer
   noch fehlen, und weist genau die zu. Von Hand nachsehen:
   ```bash
   bun run assign     # gleicht ab, ignoriert den Merker, berichtet laut
   ```
```

- [ ] **Schritt 4: Committen**

```bash
git add scripts/assign-assets.ts README.md
git commit -m "refactor: das Skript ist der laute Weg zum selben Abgleich"
```

---

# Teil 2 – Kunden

## Task 5: Namen normalisieren, zuordnen, benennen

**Dateien:**
- Create: `lib/derive.ts`
- Create: `lib/derive.test.ts`
- Modify: `lib/customers.ts:184-190` (`normalise` zieht um)

**Schnittstellen:**
- Produces: `normalise(s: string): string`, `matchKey(s: string): string`,
  `customerId(name: string): string`,
  `matchAdAccounts(pageName: string, accounts: AdAccount[]): AdAccount[]`
- Consumes: `type AdAccount` aus `lib/customers.ts` (nur Typ – kein Laufzeit-Zyklus)

- [ ] **Schritt 1: Fehlschlagende Tests schreiben**

`lib/derive.test.ts`:

```ts
/**
 * Zwei Aufgaben, zwei Funktionen: matchKey ordnet Werbekonten zu und wirft dafür
 * Rechtsformen weg, customerId benennt den Kunden und behält seinen Namen.
 */
import { expect, test } from "bun:test";
import { customerId, matchAdAccounts, matchKey, normalise } from "./derive";

const acc = (name: string) => ({
  id: `act_${name}`,
  name,
  account_status: 1,
  currency: "EUR",
  access: "client" as const,
});

test("Umlaute und ß überleben die Normalisierung als Buchstaben", () => {
  expect(normalise("Pflegedienst Schröter")).toBe("pflegedienst schroter");
  expect(normalise("Straße")).toBe("strasse");
});

test("die Id behält den Namen, der Abgleichsschlüssel wirft Rechtsformen weg", () => {
  expect(customerId("Ambulanter Pflegedienst Schröter")).toBe("ambulanterpflegedienstschroter");
  // "ambulanter" und "pflegedienst" stehen beide in NOISE.
  expect(matchKey("Ambulanter Pflegedienst Schröter")).toBe("schroter");
});

test("die Id wird bei 48 Zeichen gekappt", () => {
  expect(customerId("a".repeat(60))).toHaveLength(48);
});

test("Werbekonten treffen ihre Seite in beide Richtungen", () => {
  const accounts = [acc("Schäkel Werbekonto"), acc("Janines Pflegeteam"), acc("Fremd")];
  const hits = matchAdAccounts("Pflegedienst Schäkel", accounts);
  expect(hits.map((a) => a.name)).toEqual(["Schäkel Werbekonto"]);
});

test("ein Name, der nur aus Rechtsformen besteht, trifft nichts", () => {
  // Sonst wäre der Schlüssel leer und träfe per Teilstring jedes Konto.
  expect(matchAdAccounts("GmbH", [acc("Irgendwas")])).toEqual([]);
});
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `bun test lib/derive.test.ts`
Expected: FAIL – `Cannot find module './derive'`

- [ ] **Schritt 3: Implementierung**

`lib/derive.ts`:

```ts
/**
 * Aus dem Portfolio wird der Kunde abgeleitet. Meta kennt keinen Kundenbegriff;
 * eine erzeugte Datei, die ihn festhielt, alterte – 48 ihrer 215 Einträge zeigten
 * zuletzt auf Seiten, die es nicht mehr gab (siehe Spec).
 */
import type { AdAccount } from "./customers";

/**
 * Der beworbene Kunde wird über seinen Namen gewählt. Kleinschreibung, NFKD,
 * Diakritika weg, ß→ss: „Schröter“ und „Schroeter“ sollen dasselbe treffen.
 */
export const normalise = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replaceAll("ß", "ss");

/**
 * Rechtsformen und Branchenwörter tragen keine Unterscheidungskraft – aber nur
 * beim Zuordnen. Für den Namen des Kunden zählt sein voller Name, sonst hießen
 * zwei Häuser desselben Trägers gleich.
 */
const NOISE =
  /\b(gmbh|ug|kg|ohg|e\.?\s?v\.?|pflegedienst|pflegeteam|ambulante[rn]?|seniorenheim|residenz)\b/g;

export const matchKey = (s: string) =>
  normalise(s).replace(NOISE, "").replace(/[^a-z0-9]/g, "");

/** 48 Zeichen: lang genug, dass sich zwei Häuser eines Trägers unterscheiden. */
export const customerId = (name: string) =>
  normalise(name).replace(/[^a-z0-9]/g, "").slice(0, 48);

/**
 * Bewusst grob und in beide Richtungen: „Schäkel Werbekonto“ trifft
 * „Pflegedienst Schäkel“ und umgekehrt. Ein leerer Schlüssel trifft nichts –
 * per Teilstring träfe er sonst jedes Konto.
 */
export function matchAdAccounts(pageName: string, accounts: AdAccount[]): AdAccount[] {
  const key = matchKey(pageName);
  if (!key) return [];
  return accounts.filter((a) => {
    const other = matchKey(a.name);
    return !!other && (other.includes(key) || key.includes(other));
  });
}
```

- [ ] **Schritt 4: `normalise` in `customers.ts` ersetzen**

In `lib/customers.ts` die lokale `normalise`-Definition (Zeilen 178-190 samt
Kommentar, der Kommentar zieht mit nach `derive.ts`) löschen und stattdessen
importieren:

```ts
import { normalise } from "./derive";
```

`fuzzyCustomerMatch` und `resolveClientByName` bleiben unverändert.

- [ ] **Schritt 5: Tests laufen lassen**

Run: `bun test lib/derive.test.ts lib/customers.test.ts && bunx tsc --noEmit`
Expected: PASS – die bestehenden Fuzzy-Tests in `customers.test.ts` müssen
unverändert grün bleiben; sie prüfen dieselbe Funktion an ihrem neuen Ort.

- [ ] **Schritt 6: Committen**

```bash
git add lib/derive.ts lib/derive.test.ts lib/customers.ts
git commit -m "feat: Zuordnen und Benennen sind zwei Aufgaben, nicht eine"
```

---

## Task 6: Ids, die sich nicht vertauschen

**Dateien:**
- Modify: `lib/derive.ts`
- Modify: `lib/derive.test.ts`

**Schnittstellen:**
- Produces: `dedupeIds<T extends { id: string; source: string }>(customers: T[], pinned: Set<string>): T[]`

- [ ] **Schritt 1: Fehlschlagende Tests schreiben**

An `lib/derive.test.ts` anhängen:

```ts
import { dedupeIds } from "./derive";

const c = (source: string, id: string) => ({ source, id });

test("gleiche Ids werden nach Asset-Id durchnummeriert, nicht nach Array-Reihenfolge", () => {
  const a = dedupeIds([c("p2", "caritas"), c("p1", "caritas")], new Set());
  const b = dedupeIds([c("p1", "caritas"), c("p2", "caritas")], new Set());
  // Die Reihenfolge einer Graph-Edge ist nicht zugesichert. Hinge das Suffix an
  // ihr, tauschten zwei Kunden ihre Ids zwischen zwei Renderings – und ein
  // Lesezeichen zeigte auf den falschen.
  expect(a.find((x) => x.source === "p1")!.id).toBe("caritas");
  expect(a.find((x) => x.source === "p2")!.id).toBe("caritas-2");
  expect(b).toEqual(a.slice().reverse());
});

test("die Reihenfolge der Eingabe bleibt erhalten", () => {
  const out = dedupeIds([c("p2", "x"), c("p1", "x")], new Set());
  expect(out.map((o) => o.source)).toEqual(["p2", "p1"]);
});

test("festgesetzte Ids bleiben, die anderen weichen aus", () => {
  const out = dedupeIds([c("p1", "caritas"), c("p2", "caritas")], new Set(["p2"]));
  expect(out.find((x) => x.source === "p2")!.id).toBe("caritas");
  expect(out.find((x) => x.source === "p1")!.id).toBe("caritas-2");
});
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `bun test lib/derive.test.ts`
Expected: FAIL – `dedupeIds is not a function`

- [ ] **Schritt 3: Implementierung**

An `lib/derive.ts` anhängen:

```ts
/**
 * Zwei Häuser eines Trägers heißen fast gleich und bekämen dieselbe Id. Das
 * Suffix richtet sich nach der Asset-Id, weil die stabil ist; die Reihenfolge,
 * in der Graph die Edge liefert, ist es nicht.
 *
 * `pinned` sind die Quellen mit fester Id aus den Overrides: die weichen nie
 * aus, alles andere weicht ihnen aus.
 */
export function dedupeIds<T extends { id: string; source: string }>(
  customers: T[],
  pinned: Set<string>,
): T[] {
  const used = new Set<string>();
  for (const c of customers) if (pinned.has(c.source)) used.add(c.id);

  const fixed = new Map<string, string>();
  for (const c of [...customers].sort((a, b) => a.source.localeCompare(b.source))) {
    if (pinned.has(c.source)) continue;
    let id = c.id;
    for (let n = 2; used.has(id); n++) id = `${c.id}-${n}`;
    used.add(id);
    fixed.set(c.source, id);
  }

  return customers.map((c) => (fixed.has(c.source) ? { ...c, id: fixed.get(c.source)! } : c));
}
```

- [ ] **Schritt 4: Tests laufen lassen**

Run: `bun test lib/derive.test.ts && bunx tsc --noEmit`
Expected: PASS (8 Tests)

- [ ] **Schritt 5: Committen**

```bash
git add lib/derive.ts lib/derive.test.ts
git commit -m "feat: gleiche Namen bekommen Ids, die sich nicht vertauschen"
```

---

## Task 7: Den Kunden ableiten

**Dateien:**
- Modify: `lib/derive.ts`
- Modify: `lib/derive.test.ts`
- Modify: `lib/customers.ts:62-71` (`Customer` bekommt `source`)

**Schnittstellen:**
- Consumes: `matchAdAccounts`, `customerId`, `dedupeIds` (Tasks 5-6)
- Produces: `deriveCustomers(accounts: AdAccount[], pages: Page[]): Customer[]`
- Produces: `Customer.source: string` – die Asset-Id, aus der der Kunde stammt;
  Schlüssel für Overrides

- [ ] **Schritt 1: Fehlschlagende Tests schreiben**

An `lib/derive.test.ts` anhängen:

```ts
import { deriveCustomers } from "./derive";

const page = (id: string, name: string) => ({ id, name, access: "client" as const });

test("jede Seite wird ein Kunde, mit ihren Werbekonten", () => {
  const [c] = deriveCustomers([acc("Schäkel Werbekonto")], [page("p1", "Pflegedienst Schäkel")]);
  expect(c.id).toBe("pflegedienstschakel");
  expect(c.name).toBe("Pflegedienst Schäkel");
  expect(c.source).toBe("p1");
  expect(c.adAccounts.map((a) => a.name)).toEqual(["Schäkel Werbekonto"]);
});

test("Instagram kommt von der Seite, nicht aus einem eigenen Aufruf", () => {
  const p = { ...page("p1", "Janines"), instagram_business_account: { id: "ig1", username: "j" } };
  expect(deriveCustomers([], [p])[0].instagram).toEqual({ id: "ig1", username: "j" });
});

test("ein Werbekonto ohne Seite wird ein eigener Kunde", () => {
  // 12 der 26 Konten haben keine lebende Seite – darunter das eigene Zahlkonto.
  // Ohne diesen Zweig fiele es aus payers() und aus dem Kampagnen-Assistenten.
  const customers = deriveCustomers([acc("MedArbeiter")], []);
  expect(customers).toHaveLength(1);
  expect(customers[0].source).toBe("act_MedArbeiter");
  expect(customers[0].page).toBeUndefined();
  expect(customers[0].adAccounts).toHaveLength(1);
});

test("ein Konto, das eine Seite trifft, wird kein zweiter Kunde", () => {
  const customers = deriveCustomers(
    [acc("Schäkel Werbekonto")],
    [page("p1", "Pflegedienst Schäkel")],
  );
  expect(customers).toHaveLength(1);
});
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `bun test lib/derive.test.ts`
Expected: FAIL – `deriveCustomers is not a function`

- [ ] **Schritt 3: `Customer` um `source` erweitern**

In `lib/customers.ts` im Typ `Customer` ergänzen:

```ts
  /** Asset, aus dem der Kunde stammt: Seiten-Id, sonst act_-Id. Schlüssel für Overrides. */
  source: string;
```

- [ ] **Schritt 4: Implementierung**

An `lib/derive.ts` anhängen (Import ergänzen: `import type { AdAccount, Customer, Page } from "./customers";`):

```ts
export function deriveCustomers(accounts: AdAccount[], pages: Page[]): Customer[] {
  const taken = new Set<string>();

  const fromPages = pages.map((page): Customer => {
    const adAccounts = matchAdAccounts(page.name, accounts);
    for (const a of adAccounts) taken.add(a.id);
    return {
      source: page.id,
      // Ein Name ohne einen einzigen Buchstaben oder eine Ziffer ergäbe eine
      // leere Id; dann trägt die Asset-Id.
      id: customerId(page.name) || page.id,
      name: page.name,
      page,
      instagram: page.instagram_business_account,
      adAccounts,
      access: page.access,
      issues: [],
    };
  });

  const fromAccounts = accounts
    .filter((a) => !taken.has(a.id))
    .map((account): Customer => ({
      source: account.id,
      id: customerId(account.name) || account.id,
      name: account.name,
      page: undefined,
      instagram: undefined,
      adAccounts: [account],
      access: account.access,
      issues: [],
    }));

  return dedupeIds([...fromPages, ...fromAccounts], new Set());
}
```

- [ ] **Schritt 5: Tests laufen lassen**

Run: `bun test lib/derive.test.ts`
Expected: PASS (12 Tests). `bunx tsc --noEmit` meldet jetzt fehlende `source` in
`lib/campaigns.test.ts` (3 Stellen) und `lib/launch-request.test.ts` (1 Stelle) –
das räumt Task 10 auf.

- [ ] **Schritt 6: Committen**

```bash
git add lib/derive.ts lib/derive.test.ts lib/customers.ts
git commit -m "feat: der Kunde wird aus dem Portfolio abgeleitet"
```

---

## Task 8: Overrides – was ein Mensch entschieden hat

**Dateien:**
- Modify: `lib/customers.ts`
- Modify: `lib/customers.test.ts`

**Schnittstellen:**
- Consumes: `deriveCustomers`, `dedupeIds` (Tasks 6-7), `actId` aus `lib/graph.ts`
- Produces: `type CustomerOverride`,
  `applyOverrides(customers: Customer[], overrides: Record<string, CustomerOverride>, accounts: AdAccount[]): { customers: Customer[]; issues: string[] }`

Der Typ steht in `customers.ts`, die Daten in `customers.config.ts` (Task 10).

- [ ] **Schritt 1: Fehlschlagende Tests schreiben**

`lib/customers.test.ts`: die sieben `joinCustomers`-Tests entfallen – die
Funktion gibt es nicht mehr. Was sie geprüft haben, prüfen `derive.test.ts`
(Ableitung) und diese neuen Tests (Overrides). Die Tests zu `payers`, `clients`,
`resolveClientByName`, `fuzzyCustomerMatch`, `instagramAccountLabel`,
`needsLeadgenTos` und `listAssets` bleiben unverändert; wo sie
`joinCustomers(...)` zum Aufbau benutzen, bauen sie die Kunden jetzt als
Literale (mit `source`). `applyOverrides` in die bestehende
`await import("./customers")`-Destrukturierung am Dateikopf aufnehmen,
`joinCustomers` dort streichen.

```ts
const customer = (source: string, id: string, name = id) => ({
  source,
  id,
  name,
  adAccounts: [],
  access: "client" as const,
  issues: [],
});

test("ein Override setzt Id und Name fest", () => {
  const { customers } = applyOverrides(
    [customer("p1", "caritasaltenpflegeheimstmichaeldresden")],
    { p1: { id: "caritasstmichael", name: "Caritas St. Michael" } },
    [],
  );
  expect(customers[0].id).toBe("caritasstmichael");
  expect(customers[0].name).toBe("Caritas St. Michael");
});

test("ein Override ersetzt die Werbekonten vollständig", () => {
  const { customers } = applyOverrides(
    [{ ...customer("p1", "kunde"), adAccounts: [acc("act_1")] }],
    { p1: { adAccountIds: ["2"] } },
    [acc("act_1"), acc("act_2")],
  );
  // "2" ohne Präfix muss dasselbe Konto treffen wie "act_2".
  expect(customers[0].adAccounts.map((a) => a.id)).toEqual(["act_2"]);
});

test("hidden entfernt den Kunden", () => {
  const { customers } = applyOverrides([customer("p1", "kunde")], { p1: { hidden: true } }, []);
  expect(customers).toEqual([]);
});

test("ein Override ins Leere wird gemeldet statt still ignoriert", () => {
  // Genau so alterte die erzeugte Config: sie zeigte auf Seiten, die es nicht
  // mehr gab, und niemand erfuhr davon.
  const { issues } = applyOverrides([customer("p1", "kunde")], { p9: { id: "x" } }, []);
  expect(issues).toEqual(["Override p9 gehört zu keinem Asset im Portfolio"]);
});

test("ein Override auf ein unbekanntes Werbekonto wird gemeldet", () => {
  const { issues } = applyOverrides([customer("p1", "kunde")], { p1: { adAccountIds: ["9"] } }, []);
  expect(issues).toEqual(["Werbekonto act_9 (Override p1) ist nicht im Portfolio"]);
});

test("eine festgesetzte Id verdrängt die abgeleitete gleiche", () => {
  const { customers } = applyOverrides(
    [customer("p1", "kunde"), customer("p2", "anders")],
    { p2: { id: "kunde" } },
    [],
  );
  expect(customers.find((c) => c.source === "p2")!.id).toBe("kunde");
  expect(customers.find((c) => c.source === "p1")!.id).toBe("kunde-2");
});
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `bun test lib/customers.test.ts`
Expected: FAIL – `applyOverrides is not a function`

- [ ] **Schritt 3: Implementierung**

In `lib/customers.ts` `joinCustomers` (Zeilen 80-109) und den Import von
`customers.config` durch dies ersetzen:

```ts
import { dedupeIds, deriveCustomers } from "./derive";
import { overrides } from "./customers.config";

/**
 * Was ein Mensch entschieden hat – und nur das. Alles andere kommt aus dem
 * Portfolio, damit es nicht altert.
 */
export type CustomerOverride = {
  /** Feste Id statt der abgeleiteten – für alles, was in URLs auftaucht. */
  id?: string;
  name?: string;
  /** Ersetzt den Namensabgleich vollständig. */
  adAccountIds?: string[];
  igId?: string;
  /** Nicht als Kunde führen. */
  hidden?: true;
};

export function applyOverrides(
  customers: Customer[],
  overrides: Record<string, CustomerOverride>,
  accounts: AdAccount[],
): { customers: Customer[]; issues: string[] } {
  const known = new Set(customers.map((c) => c.source));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const issues = Object.keys(overrides)
    .filter((source) => !known.has(source))
    .map((source) => `Override ${source} gehört zu keinem Asset im Portfolio`);

  const patched = customers.flatMap((c) => {
    const o = overrides[c.source];
    if (!o) return [c];
    if (o.hidden) return [];

    let adAccounts = c.adAccounts;
    if (o.adAccountIds) {
      adAccounts = [];
      for (const id of o.adAccountIds.map(actId)) {
        const account = byId.get(id);
        if (account) adAccounts.push(account);
        else issues.push(`Werbekonto ${id} (Override ${c.source}) ist nicht im Portfolio`);
      }
    }

    return [
      {
        ...c,
        id: o.id ?? c.id,
        name: o.name ?? c.name,
        instagram: o.igId ? { id: o.igId } : c.instagram,
        adAccounts,
      },
    ];
  });

  // Nach dem Überschreiben noch einmal: eine festgesetzte Id kann auf eine
  // abgeleitete treffen. Festgesetzte gewinnen, abgeleitete weichen aus.
  const pinned = new Set(
    Object.entries(overrides)
      .filter(([, o]) => o.id)
      .map(([source]) => source),
  );
  return { customers: dedupeIds(patched, pinned), issues };
}
```

- [ ] **Schritt 4: Tests laufen lassen**

Run: `bun test lib/customers.test.ts`
Expected: PASS. `listCustomers` ist an dieser Stelle noch kaputt (`joinCustomers`
fehlt) – das ist Task 10; `bunx tsc --noEmit` schlägt hier bewusst noch an.

- [ ] **Schritt 5: Committen**

```bash
git add lib/customers.ts lib/customers.test.ts
git commit -m "feat: Overrides tragen, was ein Mensch entschieden hat"
```

---

## Task 9: Beweislauf gegen das echte Portfolio

**Dateien:**
- Create: `/private/tmp/claude-501/…/scratchpad/beweis.ts` (Wegwerfskript, **nicht** committen)

Diese Task schreibt keinen Produktionscode. Sie beantwortet die eine Frage, an
der Teil 2 hängt: **reproduziert die Ableitung die von Hand geprüfte Config?**
Die Spec hat das mit dem alten `norm()` des Skripts gemessen (167/167); die
Ableitung benutzt `normalise()` mit Umlautbehandlung. Beides muss dasselbe
treffen, bevor die alte Datei verschwindet.

- [ ] **Schritt 1: Beweisskript schreiben**

```ts
import { customers as config } from "../lib/customers.config";
import { listAssets } from "../lib/customers";
import { deriveCustomers } from "../lib/derive";

const { accounts, pages } = await listAssets();
const derived = deriveCustomers(accounts, pages);

let same = 0;
const differs: string[] = [];
for (const c of config) {
  const d = derived.find((x) => x.source === c.pageId);
  if (!d) continue; // Seite nicht mehr im Portfolio – einer der 48 toten Einträge
  const want = [...new Set(c.adAccountIds.map((i) => (i.startsWith("act_") ? i : `act_${i}`)))].sort();
  const got = d.adAccounts.map((a) => a.id).sort();
  if (JSON.stringify(want) === JSON.stringify(got)) same++;
  else differs.push(`${c.name}: Config=[${want}] Ableitung=[${got}]`);
}
console.log(`Werbekonten reproduziert: ${same}, abweichend: ${differs.length}`);
console.log(differs.join("\n"));

console.log("\n--- Ids alt → neu (nur Abweichungen) ---");
for (const c of config) {
  const d = derived.find((x) => x.source === c.pageId);
  if (d && d.id !== c.id) console.log(`${c.name}\n  alt: ${c.id}\n  neu: ${d.id}`);
}
console.log("\n--- Kunden ohne Config-Eintrag (neu sichtbar) ---");
const inConfig = new Set(config.map((c) => c.pageId));
for (const d of derived) if (!inConfig.has(d.source)) console.log(`${d.name} (${d.source})`);
```

- [ ] **Schritt 2: Laufen lassen**

Run: `bun --env-file=.env.local <pfad>/beweis.ts`
Expected: `Werbekonten reproduziert: 167, abweichend: 0`.

**Weicht auch nur eine ab, hier anhalten** und die Abweichung beurteilen, bevor
Task 10 die Config ersetzt: entweder ist die Ableitung besser als die Handarbeit
(dann notieren), oder sie ist schlechter (dann gehört das Konto als
`adAccountIds`-Override in Task 10).

- [ ] **Schritt 3: Ausgabe festhalten**

Die Id-Tabelle und die Liste der neu sichtbaren Kunden aus der Ausgabe
aufbewahren – Task 10 baut daraus die Overrides-Datei. Erwartet werden laut Spec
sieben abweichende Ids und zwölf kontenbasierte Kunden.

---

## Task 10: Umstellen und die alte Config ersetzen

**Dateien:**
- Modify: `lib/customers.ts` (`listCustomers`)
- Replace: `lib/customers.config.ts`
- Modify: `app/layout.tsx:27-34`
- Modify: `lib/campaigns.test.ts` (3 Stellen), `lib/launch-request.test.ts` (1 Stelle)

**Schnittstellen:**
- Consumes: `deriveCustomers` (Task 7), `applyOverrides` (Task 8), Beweislauf (Task 9)
- Produces: `listCustomers(): Promise<{ customers: Customer[]; errors: GraphError[]; issues: string[] }>`

- [ ] **Schritt 1: Overrides-Datei schreiben**

`lib/customers.config.ts` vollständig ersetzen. Die sieben Ids stammen aus dem
Beweislauf; `medarbeiter` ist Pflicht, weil `payers()` darauf prüft. Die
`act_`-Id für `medarbeiter` ist `act_892281195749177` (Stand 2026-08-14).

```ts
/**
 * Nur, was ein Mensch entschieden hat. Alles Ableitbare kommt aus dem Portfolio
 * (lib/derive.ts) – die Vorgängerversion dieser Datei war eine erzeugte Kopie
 * des Portfolios und zeigte zuletzt mit 48 von 215 Einträgen ins Leere.
 *
 * Schlüssel ist die Seiten-Id, bei kontenbasierten Kunden die act_-Id. Beide
 * ändern sich nicht, Namen schon.
 */
import type { CustomerOverride } from "./customers";

export const overrides: Record<string, CustomerOverride> = {
  // payers() sortiert den eigenen Zahler nach vorn und prüft dafür auf diese Id.
  act_892281195749177: { id: "medarbeiter", name: "MedArbeiter" },
  // <Seiten-Id>: { id: "kbssabinemarxgmbh" },   ← aus dem Beweislauf eintragen
};
```

Für jede der sieben Abweichungen aus Task 9 eine Zeile mit der **Seiten-Id** als
Schlüssel und der alten Id als `id`. Die Seiten-Ids stehen in der alten Config
als `pageId` – vor dem Ersetzen herauskopieren.

- [ ] **Schritt 2: `listCustomers` umstellen**

```ts
export async function listCustomers() {
  const { accounts, pages, errors } = await listAssets();
  const { customers, issues } = applyOverrides(
    deriveCustomers(accounts, pages),
    overrides,
    accounts,
  );
  return { customers, errors, issues };
}
```

- [ ] **Schritt 3: Layout die Override-Issues zeigen lassen**

In `app/layout.tsx`:

```tsx
  const { customers, errors, issues: overrideIssues } = await listCustomers();
  const issues = [...customers.flatMap((c) => c.issues), ...overrideIssues];
```

- [ ] **Schritt 4: `source` in den vier Kunden-Literalen ergänzen**

Run: `bunx tsc --noEmit`
Expected: vier Fehler `Property 'source' is missing` in `lib/campaigns.test.ts`
und `lib/launch-request.test.ts`. In jedem Literal `source: <die Seiten-Id, die
dort schon steht>` ergänzen; wo keine Seite vorkommt, die Kunden-Id nehmen.

- [ ] **Schritt 5: Alles prüfen**

Run: `bun test && bunx tsc --noEmit`
Expected: alle Tests grün, keine Typfehler.

- [ ] **Schritt 6: Die App ansehen**

Run: `bun dev`, dann `/customers` öffnen.
Expected: 167 seitenbasierte plus zwölf kontenbasierte Kunden; die
Token-Anzeige unten links steht auf `ok` (die 48 unlösbaren Issues sind weg).
Der Scope-Switcher findet MedArbeiter unter `medarbeiter`.

- [ ] **Schritt 7: Committen**

```bash
git add lib/customers.ts lib/customers.config.ts app/layout.tsx lib/campaigns.test.ts lib/launch-request.test.ts
git commit -m "feat: die Kundenliste kommt aus dem Portfolio, nicht aus einer erzeugten Datei"
```

---

## Task 11: Aus dem Generator wird der Doktor

**Dateien:**
- Modify: `scripts/customers.ts` (vollständig ersetzen)
- Modify: `README.md`

**Schnittstellen:**
- Consumes: `listAssets`, `listCustomers` (Task 10), `deriveCustomers`,
  `matchAdAccounts` (Tasks 5, 7)

- [ ] **Schritt 1: Skript ersetzen**

`scripts/customers.ts`:

```ts
/**
 * Erzeugt nichts mehr, sondern sieht nach: wo die Ableitung raten muss und wo
 * ein Override ins Leere zeigt.
 *   bun run customers
 */
import { listAssets, listCustomers } from "../lib/customers";
import { matchAdAccounts } from "../lib/derive";

const { accounts, pages } = await listAssets();
const { customers, issues } = await listCustomers();

console.log(`${pages.length} Seiten, ${accounts.length} Werbekonten, ${customers.length} Kunden\n`);

const mehrdeutig = pages
  .map((p) => ({ p, hits: matchAdAccounts(p.name, accounts) }))
  .filter(({ hits }) => hits.length > 1);
if (mehrdeutig.length) {
  console.log("Mehrdeutige Zuordnung – Namensabgleich trifft mehr als ein Konto:");
  for (const { p, hits } of mehrdeutig)
    console.log(`  ${p.name} → ${hits.map((h) => `${h.name} (${h.id})`).join(", ")}`);
  console.log("  Eindeutig machen mit adAccountIds in lib/customers.config.ts\n");
}

const ohneKonto = customers.filter((c) => c.page && !c.adAccounts.length);
console.log(`Seiten ohne Werbekonto: ${ohneKonto.length}`);
console.log("  (normal – bezahlt wird meist über MedArbeiter)\n");

const ohneSeite = customers.filter((c) => !c.page);
if (ohneSeite.length) {
  console.log("Werbekonten ohne Seite – als eigene Kunden geführt:");
  for (const c of ohneSeite) console.log(`  ${c.name} (${c.source}) → Id ${c.id}`);
  console.log("  Unerwünschte mit hidden: true ausblenden\n");
}

const suffixe = customers.filter((c) => /-\d+$/.test(c.id));
if (suffixe.length) {
  console.log("Ids mit Kollisionssuffix – ggf. sprechende Id festsetzen:");
  for (const c of suffixe) console.log(`  ${c.name} → ${c.id} (${c.source})`);
  console.log("");
}

if (issues.length) {
  console.log("Overrides, die nicht greifen:");
  for (const i of issues) console.log(`  ! ${i}`);
} else {
  console.log("Alle Overrides greifen.");
}
```

- [ ] **Schritt 2: Laufen lassen**

Run: `bun run customers`
Expected: Bericht ohne `!`-Zeilen. Steht dort ein nicht greifendes Override, ist
in Task 10 eine falsche Seiten-Id eingetragen worden.

- [ ] **Schritt 3: README ergänzen**

Unter Punkt 4 anhängen:

```markdown
   Die Kundenliste kommt aus demselben Portfolio und braucht keine Pflege. Was
   die Ableitung nicht wissen kann – feste Ids, mehrdeutige Werbekonten,
   Ausblendungen – steht in `lib/customers.config.ts`. Nachsehen, ob sie noch
   greift:
   ```bash
   bun run customers  # Bericht: Mehrdeutigkeiten, Konten ohne Seite, tote Overrides
   ```
```

- [ ] **Schritt 4: Committen**

```bash
git add scripts/customers.ts README.md
git commit -m "refactor: aus dem Generator wird der Doktor"
```

---

## Abschluss

- [ ] `bun test` – alles grün
- [ ] `bunx tsc --noEmit` – keine Fehler
- [ ] `bun run build` – der Build läuft durch (`after()` und `output: standalone`)
- [ ] `git diff --stat main` – `lib/customers.config.ts` ist um ~1340 Zeilen kürzer
- [ ] Wegwerfskript aus Task 9 ist nicht im Commit gelandet
- [ ] REQUIRED SUB-SKILL: superpowers:verification-before-completion
