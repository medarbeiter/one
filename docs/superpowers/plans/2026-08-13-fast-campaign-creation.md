# Faster Campaign Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the wait after clicking "Erstellen (pausiert)" from ~42 sequential
Graph API round trips to ~7 for a 20-ad campaign, and normalise the ad names
derived from uploaded file names.

**Architecture:** `lib/launch.ts` keeps creating the campaign and ad sets one call
at a time (one call each), then creates all ads through one of two paths: Graph's
`/` batch endpoint (creative + ad as a dependent sub-request pair, 5 ads per call)
when 9 or more ads are being created, or a 3-wide concurrency pool below that. The
pool is also the fallback when a batch call fails in a way that proves nothing was
created. Names are normalised by a pure function in `lib/media.ts` at the single
place where a file name becomes an ad name.

**Tech Stack:** TypeScript, Next.js 16, React 19, Bun (`bun test`), Meta Graph API
v26.0. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-fast-campaign-creation-design.md`

## Global Constraints

- **`BATCH_THRESHOLD = 9`** — total ads being created in this run, across all ad sets.
- **`CHUNK = 5`** ads per batch call (10 sub-requests; Graph's limit is 50).
- **`POOL = 3`** concurrent ads on the pool path, and on the fallback.
- **`omit_response_on_success: false` on every named batch sub-request.** Graph drops
  the response of a named sub-request that succeeded, which would shift every later
  position in the result array.
- **Fallback only on `GraphError`.** Any other throw (network) must not re-send those
  ads — Meta may already have created them.
- **Comments in this codebase are German**, and explain *why*, not *what*. Match the
  surrounding style. Identifiers and commit messages are English.
- **No new dependencies.**
- Tests are `bun test`. Run a single file with `bun test lib/media.test.ts`, a single
  test with `bun test lib/media.test.ts -t "part of the name"`.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/media.ts` | Pure file-name → ad-name logic | Add `normalizeAdName()`, `KEEP_CAPS` |
| `lib/media.test.ts` | Its tests | Add cases |
| `app/campaigns/new/ad-set-block.tsx` | Wizard; derives ad names at line 493 | One call swapped |
| `lib/graph.ts` | Every Graph call | Extract `encodeParams()`; `batch()` gains bodies, names, dependencies |
| `lib/graph.test.ts` | Its tests | Add batch-encoding cases |
| `lib/launch.ts` | Campaign/ad set/ad creation | Ads phase split into `createAd` / `poolAds` / `batchAds` |
| `lib/launch.test.ts` | Its tests | Add path, chunking, error, fallback, equivalence cases |

`app/api/launch/route.ts` needs no change: it calls `launch(plan, { onProgress })`
and both new dependencies default to the real ones.

---

### Task 1: `normalizeAdName()` in `lib/media.ts`

**Files:**
- Modify: `lib/media.ts` (add after `stripExtension`, around line 44)
- Test: `lib/media.test.ts`

**Interfaces:**
- Consumes: `stripExtension(fileName: string): string` — already exported from `lib/media.ts`.
- Produces: `normalizeAdName(fileName: string): string` and
  `KEEP_CAPS: string[]`, both exported from `lib/media.ts`.

- [ ] **Step 1: Write failing tests**

Add to `lib/media.test.ts`. Extend the existing import from `./media` with
`normalizeAdName` and `KEEP_CAPS`.

```ts
test("dieselbe Person bekommt aus jeder Schreibweise denselben Namen", () => {
  for (const f of ["Lea1.mov", "lea1.MP4", "Lea 1.mov", "LEA  1.mov", "lea_1.mp4"])
    expect(normalizeAdName(f)).toBe("Lea 1");
});

test("Bindestrich-Namen und mehrteilige Namen bleiben lesbar", () => {
  expect(normalizeAdName("anna-lena2.mov")).toBe("Anna-Lena 2");
  expect(normalizeAdName("anna maria 3.mov")).toBe("Anna Maria 3");
  expect(normalizeAdName("jörg2.mov")).toBe("Jörg 2");
});

test("Kürzel aus der Liste behalten ihre Großschreibung, der Rest nicht", () => {
  expect(normalizeAdName("UGC lea1.mov")).toBe("UGC Lea 1");
  expect(normalizeAdName("ugc Lea1.mov")).toBe("UGC Lea 1");
  expect(KEEP_CAPS).toContain("UGC");
  // Ganze Wörter, kein Textbestandteil: sonst würde aus "Maria" ein "MAria".
  expect(normalizeAdName("maria 1.mov")).toBe("Maria 1");
  expect(normalizeAdName("ma 2.mov")).toBe("MA 2");
});

test("ein Name, der zu nichts normalisiert, behält seinen Stamm", () => {
  expect(normalizeAdName("___.mov")).toBe("___");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `bun test lib/media.test.ts`
Expected: FAIL — `normalizeAdName is not a function` / import error.

- [ ] **Step 3: Implement**

In `lib/media.ts`, directly after `stripExtension`:

```ts
/**
 * Kürzel, die in Dateinamen groß geschrieben bleiben. Ohne diese Liste würde die
 * Regel unten aus "UGC" ein "Ugc" machen. Erweitern heißt: Wort hier eintragen,
 * in der Schreibweise, in der es in Meta stehen soll – verglichen wird ohne
 * Rücksicht auf Groß- und Kleinschreibung, ein "ugc" im Dateinamen wird dadurch
 * ebenfalls zu "UGC".
 */
export const KEEP_CAPS = ["UGC", "HKP", "PDL", "FSJ", "MA"];

const KEPT = new Map(KEEP_CAPS.map((w) => [w.toLowerCase(), w]));

function capitalize(part: string): string {
  const kept = KEPT.get(part.toLowerCase());
  if (kept) return kept;
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

/**
 * "Lea1.mov", "lea1.MP4", "Lea 1.mov" und "LEA  1.mov" sind dieselbe Person und
 * werden in Metas Anzeigenliste sonst zu vier Namen, die sich in der Auswertung
 * nicht mehr zusammenfassen lassen. Bindestriche bleiben stehen – "Anna-Lena"
 * ist ein Name und keine Trennung.
 */
export function normalizeAdName(fileName: string): string {
  const stem = stripExtension(fileName);
  const spaced = stem
    .replace(/_+/g, " ")
    // \p{L} statt [a-z]: sonst zerfiele "Jörg2" zu "Jör g2".
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const out = spaced
    .split(" ")
    .map((word) => word.split("-").map(capitalize).join("-"))
    .join(" ");
  return out || stem;
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `bun test lib/media.test.ts`
Expected: PASS, including the pre-existing tests in that file.

- [ ] **Step 5: Commit**

```bash
git add lib/media.ts lib/media.test.ts
git commit -m "feat: normalise ad names derived from file names"
```

---

### Task 2: Use the normalised name in the wizard

**Files:**
- Modify: `app/campaigns/new/ad-set-block.tsx:493` and its import block (lines 28–34)

**Interfaces:**
- Consumes: `normalizeAdName` from Task 1, `uniqueName` from `lib/media.ts`.
- Produces: nothing new.

- [ ] **Step 1: Swap the call**

At line 493 the current code is:

```ts
        const name = uniqueName(stripExtension(p.asset.fileName), taken);
```

Replace with:

```ts
        const name = uniqueName(normalizeAdName(p.asset.fileName), taken);
```

Normalisation happens *before* `uniqueName`, so de-duplication sees the final
spelling: `Lea 1.mov` and `Lea 1.mp4` still become `Lea 1` and `Lea 1 (2)`.

- [ ] **Step 2: Fix the imports**

In the import from `@/lib/media` (lines 28–34), add `normalizeAdName`. Remove
`stripExtension` **only if** no other line in the file still uses it:

Run: `grep -n "stripExtension" app/campaigns/new/ad-set-block.tsx`
If line 493 was the only hit, drop it from the import.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. An "is declared but its value is never read" error means step 2
was missed.

- [ ] **Step 4: Commit**

```bash
git add app/campaigns/new/ad-set-block.tsx
git commit -m "feat: name UGC ads from the normalised file name"
```

---

### Task 3: Extract `encodeParams()` in `lib/graph.ts`

Pure refactor, no behaviour change. It exists so a creative sent inside a batch is
serialised by exactly the same code as one sent on its own.

**Files:**
- Modify: `lib/graph.ts:102-109` (inside `graph()`)
- Test: `lib/graph.test.ts`

**Interfaces:**
- Produces: `encodeParams(params: Record<string, unknown>): URLSearchParams`,
  exported from `lib/graph.ts`. Skips `undefined` and `null`; `JSON.stringify`s
  anything else of `typeof === "object"`; `String()`s the rest.

- [ ] **Step 1: Write failing test**

Add to `lib/graph.test.ts`. Extend the existing destructured import from `./graph`
with `encodeParams`.

```ts
test("Parameter werden für Graph kodiert: Objekte als JSON, leere Werte gar nicht", () => {
  const p = encodeParams({ a: 1, t: { age_min: 25 }, skip: undefined, none: null });
  expect(p.get("a")).toBe("1");
  expect(p.get("t")).toBe('{"age_min":25}');
  expect(p.has("skip")).toBe(false);
  expect(p.has("none")).toBe(false);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test lib/graph.test.ts -t "kodiert"`
Expected: FAIL — `encodeParams is not a function`.

- [ ] **Step 3: Implement**

In `lib/graph.ts`, above `graph()`:

```ts
/**
 * Graphs Regel für Parameter: alles ist ein String, Objekte sind JSON. An einer
 * Stelle, damit ein Creative im Batch dieselbe Kodierung erfährt wie einzeln –
 * zwei Fassungen davon würden erst bei Meta auseinanderlaufen.
 */
export function encodeParams(params: Record<string, unknown>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    out.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return out;
}
```

Then replace the loop inside `graph()` (currently lines 106–109):

```ts
  for (const [k, v] of encodeParams(params)) url.searchParams.set(k, v);
```

- [ ] **Step 4: Run the whole file and verify it passes**

Run: `bun test lib/graph.test.ts`
Expected: PASS. The pre-existing serialisation test (it asserts
`searchParams.get("targeting")` is `'{"age_min":25}'` and that a skipped param is
absent) is the proof that the refactor changed nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/graph.ts lib/graph.test.ts
git commit -m "refactor: one place that encodes Graph params"
```

---

### Task 4: `batch()` learns bodies, names and dependencies

**Files:**
- Modify: `lib/graph.ts:128` (`BatchRequest`) and `lib/graph.ts:155-173` (`batch()`)
- Test: `lib/graph.test.ts`

**Interfaces:**
- Consumes: `encodeParams()` from Task 3.
- Produces: the extended type, used by Task 7:

```ts
export type BatchRequest = {
  method?: "GET" | "POST";
  relative_url: string;
  /** POST-Nutzlast; wie `params` bei graph(), nur als Query-String im Sub-Request. */
  body?: Record<string, unknown>;
  /** Macht das Ergebnis referenzierbar: "{result=<name>:$.id}". */
  name?: string;
  depends_on?: string;
};
```

`batch()`'s signature and return type are unchanged.

- [ ] **Step 1: Write failing test**

Add to `lib/graph.test.ts`. It reuses the fetch mock style already in that file —
look at the existing serialisation test and copy how it installs
`globalThis.fetch` and restores it afterwards.

```ts
test("Batch-Sub-Requests tragen Body, Name und Abhängigkeit", async () => {
  const original = globalThis.fetch;
  let sent: any;
  globalThis.fetch = (async (input: any) => {
    sent = JSON.parse(new URL(String(input)).searchParams.get("batch")!);
    return new Response(JSON.stringify([{ code: 200, body: '{"id":"cr9"}' }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as any;

  try {
    await batch([
      {
        method: "POST",
        relative_url: "act_1/adcreatives",
        name: "cr_0",
        body: { name: "Lea 1", object_story_spec: { page_id: "p1" } },
      },
      {
        method: "POST",
        relative_url: "act_1/ads",
        depends_on: "cr_0",
        body: { creative: { creative_id: "{result=cr_0:$.id}" } },
      },
    ]);
  } finally {
    globalThis.fetch = original;
  }

  const body = new URLSearchParams(sent[0].body);
  expect(body.get("name")).toBe("Lea 1");
  expect(body.get("object_story_spec")).toBe('{"page_id":"p1"}');
  // Ohne dieses Feld verschluckt Graph die Antwort des benannten Sub-Requests und
  // mit ihr seinen Platz im Ergebnis-Array – jede Zuordnung danach wäre um eins
  // verschoben.
  expect(sent[0].omit_response_on_success).toBe(false);
  expect(sent[0].name).toBe("cr_0");
  expect(sent[1].depends_on).toBe("cr_0");
  expect(new URLSearchParams(sent[1].body).get("creative")).toBe(
    '{"creative_id":"{result=cr_0:$.id}"}',
  );
  // Ein GET ohne Body schickt auch keinen mit.
  expect(sent[0]).not.toHaveProperty("body", undefined);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test lib/graph.test.ts -t "Batch-Sub-Requests"`
Expected: FAIL — the sub-request has no `body`, `name` or `depends_on`; the type
does not accept them.

- [ ] **Step 3: Implement**

Replace `BatchRequest` (line 128) with the type in **Interfaces** above, then the
mapping inside `batch()` (currently line 165):

```ts
        batch: chunk.map((r) => ({
          method: r.method ?? "GET",
          relative_url: r.relative_url,
          ...(r.body ? { body: encodeParams(r.body).toString() } : {}),
          // Ein benannter Sub-Request liefert im Erfolgsfall standardmäßig gar
          // nichts zurück – und fehlt dann im Ergebnis-Array, statt als Lücke
          // darin zu stehen.
          ...(r.name ? { name: r.name, omit_response_on_success: false } : {}),
          ...(r.depends_on ? { depends_on: r.depends_on } : {}),
        })),
```

- [ ] **Step 4: Run the whole file and verify it passes**

Run: `bun test lib/graph.test.ts`
Expected: PASS, including existing `batch()` tests (chunking at 50, `unwrapBatchItem`).

- [ ] **Step 5: Commit**

```bash
git add lib/graph.ts lib/graph.test.ts
git commit -m "feat: batch sub-requests can carry bodies and result references"
```

---

### Task 5: Split the ads phase out of `launch()` — no behaviour change

`launch()`'s ad loop becomes a flat list of jobs plus one `createAd()`. Still
sequential, still the same calls in the same order. This exists so Tasks 6–8 change
one small function each instead of a nested loop.

**Files:**
- Modify: `lib/launch.ts:266-403`
- Test: `lib/launch.test.ts` (existing tests must keep passing unchanged)

**Interfaces:**
- Produces, at module level in `lib/launch.ts` (not exported — internal to the file):

```ts
type AdJob = { set: AdSetInput; entry: Receipt["adSets"][number]; ad: AdInput };
type Ctx = {
  graph: typeof realGraph;
  acct: string;
  pageId: string;
  receipt: Receipt;
  step: (label: string) => void;
  stepDone: () => void;
};
async function createAd(ctx: Ctx, job: AdJob): Promise<void>;
function creativeParams(ctx: Ctx, job: AdJob): Record<string, unknown>;
```

- [ ] **Step 1: Add the helpers**

Above `launch()` in `lib/launch.ts`:

```ts
/** Eine Anzeige mit allem, was zu ihrem Anlegen gehört: die Gruppe, aus der ihre
 * Texte und ihr Formular kommen, und die Quittungszeile, in die ihre Id gehört. */
type AdJob = { set: AdSetInput; entry: Receipt["adSets"][number]; ad: AdInput };

type Ctx = {
  graph: typeof realGraph;
  acct: string;
  pageId: string;
  receipt: Receipt;
  step: (label: string) => void;
  stepDone: () => void;
};

/** Einmal gebaut, von beiden Wegen benutzt: einzeln und im Batch geht dieselbe
 * Nutzlast an Meta, sonst wäre der schnelle Weg nicht derselbe Weg. */
function creativeParams(ctx: Ctx, { set, ad }: AdJob): Record<string, unknown> {
  return {
    // Nur der Name der Anzeige. Der Kampagnenname steht schon auf der Kampagne;
    // in der Anzeigenliste wiederholt er sich sonst in jeder Zeile und schiebt
    // genau das aus dem Bild, was man dort sucht.
    name: ad.name,
    ...buildCreative({
      pageId: ctx.pageId,
      instagramUserId: set.instagramUserId,
      formId: set.formId,
      bodies: set.bodies,
      titles: set.titles,
      description: set.description,
      ad,
    }),
  };
}

const adParams = (job: AdJob) => ({
  name: job.ad.name,
  adset_id: job.entry.id,
  status: "ACTIVE",
});

const fail = (ctx: Ctx, job: AdJob, error: string) =>
  ctx.receipt.failed.push({ adSetName: job.set.name, adName: job.ad.name, error });

/** Creative und Anzeige einzeln, zwei Aufrufe nacheinander. */
async function createAd(ctx: Ctx, job: AdJob): Promise<void> {
  try {
    ctx.step(`Anzeige „${job.ad.name}“ in „${job.set.name}“ wird erstellt`);
    const creative = await ctx.graph<{ id: string }>(`${ctx.acct}/adcreatives`, {
      method: "POST",
      params: creativeParams(ctx, job),
    });
    const created = await ctx.graph<{ id: string }>(`${ctx.acct}/ads`, {
      method: "POST",
      params: { ...adParams(job), creative: { creative_id: creative.id } },
    });
    job.entry.adIds.push(created.id);
  } catch (e) {
    fail(ctx, job, (e as Error).message);
  } finally {
    // Auch eine gescheiterte Anzeige ist abgearbeitet – der Fehler steht in der
    // Receipt, die Anzeige darf deswegen nicht stehen bleiben.
    ctx.stepDone();
  }
}
```

- [ ] **Step 2: Rewrite the body of `launch()`**

Keep everything from the top of `launch()` through the campaign creation exactly as
it is. Build `ctx` right after `receipt`/`step`/`stepDone` are defined:

```ts
  const ctx: Ctx = { graph, acct, pageId: input.pageId, receipt, step, stepDone };
```

Then replace the `for (const set of input.adSets)` loop with an ad set loop that
only creates ad sets and collects jobs, followed by the ads phase:

```ts
  const jobs: AdJob[] = [];

  for (const set of input.adSets) {
    const entry: Receipt["adSets"][number] = { name: set.name, adIds: [] };
    receipt.adSets.push(entry);

    if (set.existingAdSetId) {
      // Retry: das Ad Set gibt es schon, nur ein Teil seiner Anzeigen fehlt.
      entry.id = set.existingAdSetId;
    } else {
      try {
        step(`Anzeigengruppe „${set.name}“ wird erstellt`);
        const adset = await graph<{ id: string }>(`${acct}/adsets`, {
          method: "POST",
          params: {
            name: set.name,
            campaign_id: receipt.campaignId,
            status: "ACTIVE",
            destination_type: "ON_AD",
            promoted_object: { page_id: input.pageId },
            optimization_goal: "LEAD_GENERATION",
            billing_event: "IMPRESSIONS",
            bid_strategy: "LOWEST_COST_WITHOUT_CAP",
            targeting: buildTargeting({
              addressString: set.addressString,
              radiusKm: set.radiusKm,
            }),
            ...(set.dailyBudgetCents ? { daily_budget: set.dailyBudgetCents } : {}),
          },
        });
        entry.id = adset.id;
        stepDone();
      } catch (e) {
        entry.error = (e as Error).message;
        // Ohne das hätte der Bediener keinen Weg, das komplette Ad Set über den
        // Retry nachzuholen – genau der Reparaturfall, für den die Receipt
        // existiert. Jede Anzeige zählt als "fehlgeschlagen", obwohl keine
        // einzeln versucht wurde.
        for (const ad of set.ads) {
          receipt.failed.push({ adSetName: set.name, adName: ad.name, error: entry.error });
        }
        // Übersprungen, nicht offen: sonst bliebe die Anzeige bei 6 von 10
        // stehen, während längst die nächste Gruppe läuft.
        done += set.ads.length;
        continue;
      }
    }

    for (const ad of set.ads) jobs.push({ set, entry, ad });
  }

  for (const job of jobs) await createAd(ctx, job);

  return receipt;
```

Note `step`/`stepDone` close over `done`, so `done += set.ads.length` still works.

- [ ] **Step 3: Run the existing suite and verify nothing changed**

Run: `bun test lib/launch.test.ts && bunx tsc --noEmit`
Expected: PASS, every existing test, unchanged. Any failure here is a mistake in the
move, not a test that needs adjusting — the call sequence is identical.

- [ ] **Step 4: Commit**

```bash
git add lib/launch.ts
git commit -m "refactor: ads phase as a flat job list"
```

---

### Task 6: The pool path

**Files:**
- Modify: `lib/launch.ts`
- Test: `lib/launch.test.ts`

**Interfaces:**
- Consumes: `createAd`, `Ctx`, `AdJob` from Task 5.
- Produces: `async function poolAds(ctx: Ctx, jobs: AdJob[]): Promise<void>` and the
  constant `POOL = 3`, both used by Tasks 7–8.

- [ ] **Step 1: Make the existing failure test order-independent first**

The test at `lib/launch.test.ts:294` fails "the 6th call" to pick the second ad's
`/ads`. With a pool, call numbering stops matching that ad. Change `fakeGraph`
(line 211) to hand the predicate the params too:

```ts
function fakeGraph(fail?: (path: string, n: number, params: any) => boolean) {
```
```ts
    if (fail?.(path, n, opts.params)) throw new Error("boom");
```

and the call site at line 296:

```ts
  // Nach Namen und nicht nach Aufrufnummer: welcher Aufruf der sechste ist,
  // hängt am Weg, das Scheitern der zweiten Anzeige nicht.
  const { g } = fakeGraph((path, _n, p) => path.endsWith("/ads") && p?.name === "b.mp4");
```

Run: `bun test lib/launch.test.ts`
Expected: PASS (still sequential at this point).

- [ ] **Step 2: Write failing test**

```ts
test("Anzeigen laufen zu dritt, nicht nacheinander", async () => {
  let open = 0;
  let peak = 0;
  const g = async <T = any>(path: string, opts: any = {}): Promise<T> => {
    if (path.endsWith("/adcreatives")) {
      open++;
      peak = Math.max(peak, open);
      await new Promise((r) => setTimeout(r, 5));
      open--;
    }
    return { id: `${path.split("/").pop()}-x` } as T;
  };
  const eight = {
    ...oneAdSet,
    adSets: [
      {
        ...oneAdSet.adSets[0],
        ads: Array.from({ length: 8 }, (_, i) => adOf(`a${i}.mp4`, `v${i}`)),
      },
    ],
  };
  const r = await launch(eight, { graph: g });
  expect(peak).toBe(3);
  expect(r.adSets[0].adIds).toHaveLength(8);
  expect(r.failed).toHaveLength(0);
});
```

- [ ] **Step 3: Run test and verify it fails**

Run: `bun test lib/launch.test.ts -t "zu dritt"`
Expected: FAIL — `expect(peak).toBe(3)` receives 1.

- [ ] **Step 4: Implement**

Add above `launch()`:

```ts
/**
 * Drei Anzeigen gleichzeitig. Nicht mehr, weil derselbe Weg auch der Rückfall
 * für einen gescheiterten Batch ist – und der scheitert im Zweifel an einem
 * Rate-Limit, in das hineinzurennen die Sache nicht besser macht.
 */
const POOL = 3;

async function poolAds(ctx: Ctx, jobs: AdJob[]): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(POOL, jobs.length) }, async () => {
      while (next < jobs.length) await createAd(ctx, jobs[next++]);
    }),
  );
}
```

and replace the sequential line from Task 5:

```ts
  for (const job of jobs) await createAd(ctx, job);
```

with:

```ts
  await poolAds(ctx, jobs);
```

- [ ] **Step 5: Run the whole file and verify it passes**

Run: `bun test lib/launch.test.ts`
Expected: PASS. Receipts are unaffected: `adIds` order can now differ from input
order within an ad set, which no test asserts and Meta does not care about.

- [ ] **Step 6: Commit**

```bash
git add lib/launch.ts lib/launch.test.ts
git commit -m "perf: create ads three at a time"
```

---

### Task 7: The batch path

**Files:**
- Modify: `lib/launch.ts`
- Test: `lib/launch.test.ts`

**Interfaces:**
- Consumes: `batch` and `unwrapBatchItem` from `lib/graph.ts` (Task 4), `Ctx`,
  `AdJob`, `creativeParams`, `adParams`, `fail` from Task 5.
- Produces:
```ts
export type LaunchDeps = {
  graph?: typeof realGraph;
  batch?: typeof realBatch;
  onProgress?: (p: LaunchProgress) => void;
};
```
  `Ctx` gains `batch: typeof realBatch`.
  `async function batchAds(ctx: Ctx, jobs: AdJob[]): Promise<void>`.
  Constants `BATCH_THRESHOLD = 9`, `CHUNK = 5`.

- [ ] **Step 1: Write failing tests**

```ts
function fakeBatch() {
  const sent: any[][] = [];
  const b = async <T = any>(reqs: any[]): Promise<PromiseSettledResult<T>[]> => {
    sent.push(reqs);
    return reqs.map((r, i) => ({
      status: "fulfilled" as const,
      value: { id: `${r.relative_url.split("/").pop()}-${sent.length}-${i}` } as T,
    }));
  };
  return { b, sent };
}

const manyAds = (n: number) => ({
  ...oneAdSet,
  adSets: [
    {
      ...oneAdSet.adSets[0],
      ads: Array.from({ length: n }, (_, i) => adOf(`a${i}.mp4`, `v${i}`)),
    },
  ],
});

test("ab neun Anzeigen wird gebündelt, darunter nicht", async () => {
  const eight = fakeBatch();
  await launch(manyAds(8), { graph: fakeGraph().g, batch: eight.b });
  expect(eight.sent).toHaveLength(0);

  const nine = fakeBatch();
  await launch(manyAds(9), { graph: fakeGraph().g, batch: nine.b });
  expect(nine.sent).not.toHaveLength(0);
});

test("zwanzig Anzeigen sind vier Aufrufe zu je fünf Anzeigen", async () => {
  const { b, sent } = fakeBatch();
  const r = await launch(manyAds(20), { graph: fakeGraph().g, batch: b });
  expect(sent).toHaveLength(4);
  for (const call of sent) expect(call).toHaveLength(10);
  expect(r.adSets[0].adIds).toHaveLength(20);
  expect(r.failed).toHaveLength(0);
});

test("die Anzeige hängt am Creative desselben Paares", async () => {
  const { b, sent } = fakeBatch();
  await launch(manyAds(9), { graph: fakeGraph().g, batch: b });
  const [creative, ad] = sent[0];
  expect(creative.relative_url).toBe("act_1/adcreatives");
  expect(creative.name).toBe("cr_0");
  expect(creative.body.name).toBe("a0.mp4");
  expect(ad.relative_url).toBe("act_1/ads");
  expect(ad.depends_on).toBe("cr_0");
  expect(ad.body.creative).toEqual({ creative_id: "{result=cr_0:$.id}" });
  expect(sent[1][0].name).toBe("cr_5");
});

test("Anzeigen zweier Gruppen teilen sich einen Aufruf und behalten ihre Gruppe", async () => {
  const { b, sent } = fakeBatch();
  const two = {
    ...oneAdSet,
    adSets: [
      { ...oneAdSet.adSets[0], name: "A", ads: [adOf("a.mp4", "v1")] },
      { ...oneAdSet.adSets[0], name: "B", ads: Array.from({ length: 8 }, (_, i) => adOf(`b${i}.mp4`, `w${i}`)) },
    ],
  };
  await launch(two, { graph: fakeGraph().g, batch: b });
  const adsIn = sent[0].filter((r: any) => r.relative_url.endsWith("/ads"));
  expect(new Set(adsIn.map((r: any) => r.body.adset_id)).size).toBe(2);
});

test("ein gescheitertes Creative ist ein Fehler und nicht zwei", async () => {
  // Meta liefert für den abhängigen Sub-Request dann null, und unwrapBatchItem
  // macht daraus "timed out" – das darf nicht als zweiter Fehler derselben
  // Anzeige in der Receipt landen.
  const b = async <T = any>(reqs: any[]): Promise<PromiseSettledResult<T>[]> =>
    reqs.map((r, i) =>
      i === 0
        ? { status: "rejected" as const, reason: new Error("creative kaputt") }
        : i === 1
          ? { status: "rejected" as const, reason: new Error("Batch sub-request timed out") }
          : { status: "fulfilled" as const, value: { id: `x-${i}` } as T },
    );
  const r = await launch(manyAds(9), { graph: fakeGraph().g, batch: b });
  expect(r.failed).toEqual([
    { adSetName: "Ads", adName: "a0.mp4", error: "creative kaputt" },
  ]);
  expect(r.adSets[0].adIds).toHaveLength(8);
});

test("eine gescheiterte Anzeige nach heilem Creative steht mit ihrem Fehler da", async () => {
  const b = async <T = any>(reqs: any[]): Promise<PromiseSettledResult<T>[]> =>
    reqs.map((r, i) =>
      i === 1
        ? { status: "rejected" as const, reason: new Error("anzeige kaputt") }
        : { status: "fulfilled" as const, value: { id: `x-${i}` } as T },
    );
  const r = await launch(manyAds(9), { graph: fakeGraph().g, batch: b });
  expect(r.failed).toEqual([
    { adSetName: "Ads", adName: "a0.mp4", error: "anzeige kaputt" },
  ]);
});

test("der Fortschritt zählt weiter in Anzeigen", async () => {
  const seen: LaunchProgress[] = [];
  const { b } = fakeBatch();
  await launch(manyAds(9), {
    graph: fakeGraph().g,
    batch: b,
    onProgress: (p) => seen.push(p),
  });
  // 1 Kampagne + 1 Anzeigengruppe + 9 Anzeigen
  expect(seen[0].total).toBe(11);
  expect(seen.at(-1)!.done).toBe(7);
  expect(seen.at(-1)!.label).toContain("6–9 von 9");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `bun test lib/launch.test.ts -t "gebündelt"`
Expected: FAIL — `launch()` does not accept a `batch` dep and never calls it.

- [ ] **Step 3: Implement**

Import at the top of `lib/launch.ts` (next to the existing `graph as realGraph`):

```ts
import { batch as realBatch, graph as realGraph, unwrapBatchItem } from "./graph";
```

Extend `LaunchDeps` and `Ctx` with `batch`, and in `launch()`:

```ts
  const batchFn = deps.batch ?? realBatch;
```
```ts
  const ctx: Ctx = { graph, batch: batchFn, acct, pageId: input.pageId, receipt, step, stepDone };
```

Add the constants and `batchAds` above `launch()`:

```ts
/**
 * Ab hier lohnt das Bündeln. Darunter spart es gegenüber dem Pool ein bis zwei
 * Sekunden und kostet dafür die Meldung je Anzeige – bei einer Kampagne, die
 * klein genug ist, um ihr zuzusehen, ist das der schlechtere Tausch.
 */
const BATCH_THRESHOLD = 9;

/**
 * Fünf Anzeigen sind zehn Sub-Requests, Graph nimmt fünfzig. Zehn Anzeigen je
 * Aufruf wären noch einmal halb so viele Aufrufe und ungefähr eine Sekunde; fünf
 * halten dafür die Fortschrittsanzeige in Bewegung und die Nutzlast einer
 * Split-Anzeige klein.
 */
const CHUNK = 5;

async function batchAds(ctx: Ctx, jobs: AdJob[]): Promise<void> {
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const chunk = jobs.slice(i, i + CHUNK);
    ctx.step(`Anzeigen ${i + 1}–${i + chunk.length} von ${jobs.length} werden erstellt`);

    const items = await ctx.batch<{ id: string }>(
      chunk.flatMap((job, k) => [
        {
          method: "POST" as const,
          relative_url: `${ctx.acct}/adcreatives`,
          name: `cr_${i + k}`,
          body: creativeParams(ctx, job),
        },
        {
          method: "POST" as const,
          relative_url: `${ctx.acct}/ads`,
          depends_on: `cr_${i + k}`,
          body: { ...adParams(job), creative: { creative_id: `{result=cr_${i + k}:$.id}` } },
        },
      ]),
    );

    chunk.forEach((job, k) => {
      // Fehlt ein Eintrag ganz, ist das derselbe Fall wie ein leerer: keine
      // Antwort zu dieser Anzeige.
      const creative = items[k * 2] ?? unwrapBatchItem<{ id: string }>(null);
      const ad = items[k * 2 + 1] ?? unwrapBatchItem<{ id: string }>(null);
      // Reihenfolge ist die Aussage: scheitert das Creative, ist die Anzeige
      // dahinter nur die Folge davon und kein zweiter Fehler.
      if (creative.status === "rejected") fail(ctx, job, (creative.reason as Error).message);
      else if (ad.status === "rejected") fail(ctx, job, (ad.reason as Error).message);
      else job.entry.adIds.push(ad.value.id);
      ctx.stepDone();
    });
  }
}
```

Then pick the path in `launch()`, replacing `await poolAds(ctx, jobs);`:

```ts
  if (jobs.length >= BATCH_THRESHOLD) await batchAds(ctx, jobs);
  else await poolAds(ctx, jobs);
```

- [ ] **Step 4: Run the whole file and verify it passes**

Run: `bun test lib/launch.test.ts && bunx tsc --noEmit`
Expected: PASS. Existing tests use two ads and stay on the pool path.

- [ ] **Step 5: Commit**

```bash
git add lib/launch.ts lib/launch.test.ts
git commit -m "perf: create ads in batches of five above nine ads"
```

---

### Task 8: Fallback for a failed batch call

**Files:**
- Modify: `lib/launch.ts` (`batchAds`)
- Test: `lib/launch.test.ts`

**Interfaces:**
- Consumes: `GraphError` from `lib/graph.ts`, `poolAds` from Task 6.
- Produces: nothing new.

- [ ] **Step 1: Write failing tests**

```ts
test("ein Batch-Fehler von Meta wird einzeln nachgeholt", async () => {
  // Meta hat mit einem Fehler-Body geantwortet – dann ist kein Sub-Request
  // gelaufen und dieselben Anzeigen dürfen noch einmal los.
  const b = async () => {
    throw new GraphError({ kind: "rate", message: "limit", retryable: true });
  };
  const { g, calls } = fakeGraph();
  const r = await launch(manyAds(9), { graph: g, batch: b as any });
  expect(r.adSets[0].adIds).toHaveLength(9);
  expect(r.failed).toHaveLength(0);
  expect(calls.filter((c) => c.path.endsWith("/adcreatives"))).toHaveLength(9);
});

test("ein abgerissener Batch wird nicht nachgeholt, sondern benannt", async () => {
  // Ohne Antwort von Meta ist offen, ob die zehn Sub-Requests gelaufen sind.
  // Ein zweiter Versuch legt im Zweifel jede Anzeige doppelt an.
  const b = async () => {
    throw new TypeError("fetch failed");
  };
  const { g, calls } = fakeGraph();
  const r = await launch(manyAds(9), { graph: g, batch: b as any });
  expect(calls.some((c) => c.path.endsWith("/adcreatives"))).toBe(false);
  expect(r.failed).toHaveLength(9);
  expect(r.failed[0].error).toContain("fetch failed");
  expect(r.failed[0].error).toContain("möglicherweise");
  expect(r.campaignId).toBeTruthy();
});
```

Add `GraphError` to the `./graph` import in `lib/launch.test.ts`.

- [ ] **Step 2: Run tests and verify they fail**

Run: `bun test lib/launch.test.ts -t "Batch"`
Expected: FAIL — the throw escapes `launch()` and the receipt is lost.

- [ ] **Step 3: Implement**

Wrap the `ctx.batch(...)` call in `batchAds`:

```ts
    let items: PromiseSettledResult<{ id: string }>[];
    try {
      items = await ctx.batch<{ id: string }>(/* unverändert */);
    } catch (e) {
      if (e instanceof GraphError) {
        // Meta hat geantwortet, also mit einem Fehler-Body: ein Batch, der
        // gelaufen ist, kommt mit 200 und Einzelcodes zurück. Kein Sub-Request
        // ist also entstanden, und dieselben Anzeigen dürfen einzeln los.
        await poolAds(ctx, chunk);
        continue;
      }
      // Ohne Antwort von Meta ist das Gegenteil nicht gesagt: die zehn
      // Sub-Requests können längst gelaufen sein. Ein zweiter Versuch legt sie
      // dann ein zweites Mal an, und das sieht in der Anzeigengruppe niemand als
      // Fehler – deshalb hier stehen lassen und benennen.
      for (const job of chunk) {
        fail(
          ctx,
          job,
          `${(e as Error).message} — diese Anzeigen wurden möglicherweise trotzdem erstellt. Prüfe die Anzeigengruppe, bevor du sie erneut anlegst.`,
        );
        ctx.stepDone();
      }
      continue;
    }
```

Add `GraphError` to the `./graph` import in `lib/launch.ts`.

- [ ] **Step 4: Run the whole file and verify it passes**

Run: `bun test lib/launch.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/launch.ts lib/launch.test.ts
git commit -m "fix: retry a rejected batch one ad at a time, never a torn one"
```

---

### Task 9: Both paths produce the same receipt

The property that matters after all of this: which path ran must not be observable
in the result.

**Files:**
- Test: `lib/launch.test.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the test**

The path is chosen from the ad count, and there is deliberately no override to force
one — a test-only escape hatch in `LaunchDeps` would be a second way for production
to pick a path. So the two runs differ by one ad, eight (pool) against nine (batch),
and what is compared is the shape of the receipt rather than the numbers in it.

```ts
test("beide Wege liefern dieselbe Quittung", async () => {
  const shape = (r: Awaited<ReturnType<typeof launch>>) => ({
    campaign: Boolean(r.campaignId),
    sets: r.adSets.map((s) => ({ name: s.name, ads: s.adIds.length, error: s.error })),
    failed: r.failed,
  });

  // Achtmal ist unter der Schwelle (Pool), neunmal darüber (Batch) – verglichen
  // wird die Form, nicht die Anzahl.
  const pool = shape(await launch(manyAds(8), { graph: fakeGraph().g, batch: fakeBatch().b }));
  const batched = shape(await launch(manyAds(9), { graph: fakeGraph().g, batch: fakeBatch().b }));

  expect(pool.campaign).toBe(true);
  expect(batched.campaign).toBe(true);
  expect(pool.failed).toEqual([]);
  expect(batched.failed).toEqual([]);
  expect(pool.sets[0]).toEqual({ name: "Ads", ads: 8, error: undefined });
  expect(batched.sets[0]).toEqual({ name: "Ads", ads: 9, error: undefined });
});
```

- [ ] **Step 2: Run it**

Run: `bun test lib/launch.test.ts -t "dieselbe Quittung"`
Expected: PASS (no implementation change needed; this pins the contract).

- [ ] **Step 3: Run everything**

Run: `bun test && bunx tsc --noEmit`
Expected: the full suite passes.

- [ ] **Step 4: Commit**

```bash
git add lib/launch.test.ts
git commit -m "test: both ad-creation paths yield the same receipt"
```

---

## Manual verification

Automated tests never call Meta. Before considering this done, one real campaign
against the live account, because the two things most likely to be wrong —
`omit_response_on_success` and the `{result=cr_N:$.id}` substitution — are things
only Meta can confirm:

1. `bun dev`, build a campaign with **9 or more UGC ads** so the batch path runs.
2. Watch the progress line: it should step in fives ("Anzeigen 6–10 von 20").
3. When it finishes, the verification checklist must show all ads created, each with
   its lead form, campaign paused.
4. In the Ads Manager, confirm ad names read `Lea 1`, not `Lea1.mov`.
5. Repeat with **fewer than 9 ads** to exercise the pool path.

A batch path that silently mismaps would show up in step 3 as ads with the wrong
form or a wrong count — that checklist is the safety net, so do not skip it.
