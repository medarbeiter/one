# MedArbeiter One — Faster Campaign Creation

**Date:** 2026-08-13
**Status:** Approved, ready for implementation planning
**Scope:** `lib/graph.ts`, `lib/launch.ts`, `lib/media.ts`,
`app/campaigns/new/ad-set-block.tsx`

---

## 1. Purpose

Clicking **Erstellen (pausiert)** takes about a minute. Nothing is uploaded at that
point — videos and images go to Meta while the files are being picked, through
`app/api/upload`. The whole wait is `lib/launch.ts` talking to the Graph API one
request at a time.

For the shape the agency actually runs — **one campaign, one ad set, 5–20 ads** —
the current cost is:

| Step | Calls |
|---|---|
| Campaign | 1 |
| Ad set | 1 |
| Per ad: `/adcreatives`, then `/ads` | 2 × N |
| `verifyCampaign` | 1 |

At 20 ads that is **42 sequential round trips**, each one a full request to Meta.
The per-ad pairs are 40 of them, so that is where the time is.

This spec makes those pairs travel together, and — unrelated to speed but touching
the same call path — fixes the names the ads are created under.

---

## 2. Decisions

| Question | Decision |
|---|---|
| How to cut round trips | Graph's `/` batch endpoint, creative and ad in one sub-request pair joined by a result reference |
| When to batch | Total ads to create ≥ 9 |
| Below that | Bounded parallelism over the existing per-ad code |
| Batch chunk size | 5 ads (10 sub-requests) |
| Batch chunk fails wholesale | Fall back to the parallel path — but only on `GraphError` |
| Network failure mid-batch | No fallback; report it |
| Progress granularity | Denominator stays in ads; batch path advances per chunk |
| Ad names | Normalised at the point they are derived from a file name |
| Acronyms in names | Whitelist, matched whole-token and case-insensitively |

---

## 3. Faster creation

### 3.1 Path selection

`launch()` counts the ads it is about to create:

```ts
const adCount = input.adSets.reduce((n, s) => n + s.ads.length, 0);
```

For a retry this is already only the missing ads, which is correct — a retry of
three ads should not pay for a batch path sized for twenty.

`adCount >= BATCH_THRESHOLD` (9) takes the batch path, anything smaller the pool
path. Below nine ads the batch saves perhaps two seconds over the pool, which does
not pay for coarser progress on a campaign small enough to watch.

Campaign and ad set creation are unchanged: sequential, one call each, keeping the
existing behaviour where a failed ad set records an error, marks all of its ads
failed, and skips ahead. Only the ads phase forks, and it runs across **all** ad
sets at once — an ad sub-request carries its own `adset_id`, so ads from different
sets share a chunk without interfering.

### 3.2 Batch mechanics (`lib/graph.ts`)

`BatchRequest` gains `body?: Record<string, unknown>`, `name?: string`, and
`depends_on?: string`. Per ad, two sub-requests:

1. `POST /act_X/adcreatives`, named `cr_<i>`, body = the current `buildCreative()`
   payload plus the ad name.
2. `POST /act_X/ads`, body = name, `adset_id`, `status`, and
   `creative={"creative_id":"{result=cr_<i>:$.id}"}`.

Two details decide whether this works at all:

- **`omit_response_on_success: false` on every named sub-request.** Graph drops the
  response body of a *named* sub-request that succeeded. Without this flag the
  result array silently loses an entry per successful creative and every
  position-based item→ad mapping after it is wrong.
- **Sub-request bodies are URL-encoded query strings**, with nested objects
  JSON-stringified first — the same serialisation `graph()` already performs when
  it fills `searchParams`. That logic moves into one exported `encodeParams()` used
  by both, so the creative payload cannot drift between the batch and pool paths.

Chunk size is **5 ads = 10 sub-requests**, well under Graph's limit of 50. Ten ads
per chunk would halve the calls again and save roughly a second; five keeps the
progress bar moving four times instead of twice across a 20-ad campaign, and keeps
split-ad payloads (the large ones — full `asset_feed_spec` with customization
rules) clear of the batch request size limit.

The outer batch call goes through `graph()`, so it already carries the three-try
retry with backoff for rate limits.

### 3.3 Pool path

The existing per-ad loop body is unchanged — `/adcreatives` then `/ads`, per-ad
progress, per-ad error into `receipt.failed`. It runs through a small concurrency
pool instead of a `for` loop. Concurrency **3**: fast enough that eight ads finish
in three waves instead of eight, gentle enough to double as the rate-limit fallback
(§3.5) without a second constant.

### 3.4 Progress and errors

`launchSteps()` is unchanged and the denominator stays in ads, so the two paths are
indistinguishable in the UI's numbers. The batch path reports before each chunk
(`Anzeigen 6–10 von 20 werden erstellt`) and advances `done` by the chunk size
after it returns.

Batch results are read in pairs per ad:

| Creative item | Ad item | Recorded |
|---|---|---|
| fulfilled | fulfilled | `entry.adIds.push(id)` |
| rejected | `null` | one `failed` entry with the creative's error; the `null` is expected and ignored |
| fulfilled | rejected | one `failed` entry with the ad's error |
| fulfilled | `null` | one `failed` entry, treated as the genuine timeout it is |

Row two is the reason this pairing exists: `unwrapBatchItem()` maps `null` to
"Batch sub-request timed out", which for a dependent request whose dependency
failed would put a second, misleading failure line against a single ad.

### 3.5 Fallback

A chunk that fails as a whole falls back to the pool path **for that chunk's ads
only**, and only when the thrown error is a `GraphError`.

That condition is load-bearing. A `GraphError` means Meta answered with an error
body — a batch that actually executed returns HTTP 200 with per-item codes, so an
error body means no sub-request ran and re-sending those ads is safe. A
network-level failure gives no such guarantee: Meta may have created all ten
sub-requests before the socket died, and retrying would put duplicate creatives and
duplicate ads in the ad set. Those surface as a failure carrying the "may have been
partly created" wording the UI already uses when the stream breaks.

Accepted cost: a rare hard failure where a retry would have been harmless. The
alternative — duplicate live ads in a customer's ad set — is worse and is not
visible from the receipt.

### 3.6 Expected effect

20 ads: **42 round trips → 7** (campaign, ad set, 4 batches, verify).
8 ads: still 18 calls, but the 16 per-ad ones run as three waves of pairs — about
six call-times instead of sixteen.

---

## 4. Ad names from file names

### 4.1 Today

`app/campaigns/new/ad-set-block.tsx:493` derives a UGC ad's name with
`uniqueName(stripExtension(p.asset.fileName), taken)`. The extension goes; nothing
else does. Files arrive as `Lea1.mov`, `lea1.MP4`, `Lea 1.mov`, `LEA  1.mov`, and
each spelling reaches Meta's ad list as written — the same performer under four
names, not groupable in reporting.

### 4.2 `normalizeAdName()` in `lib/media.ts`

A pure function beside `stripExtension()`, applied at that one call site, before
`uniqueName()` (so de-duplication still sees the final spelling). In order:

1. Strip the extension (reuse `stripExtension()`).
2. Underscores → spaces. Hyphens are **kept**: `Anna-Lena` is a real name.
3. Insert a space at every letter↔digit boundary, both directions:
   `Lea1` → `Lea 1`. Unicode letter classes (`\p{L}`, `\p{N}`, `u` flag) so umlauts
   count as letters — `Jörg2` must not split as `Jör g2`.
4. Collapse runs of whitespace, trim.
5. Capitalise each word: first letter up, rest down, applied per hyphen-part too
   (`anna-lena` → `Anna-Lena`).
6. Whitelist override, per whole token (and per hyphen-part), case-insensitive:
   a token equal to a whitelist entry is emitted in the whitelist's own spelling.

If the result is empty, fall back to the stem — an unnameable file keeps whatever
it had rather than becoming `""`.

```
Lea1.mov      lea1.MP4      Lea 1.mov      LEA  1.mov   →  Lea 1
lea_1.mp4                                               →  Lea 1
anna-lena2.mov                                          →  Anna-Lena 2
anna maria 3.mov                                        →  Anna Maria 3
UGC lea1.mov  ugc Lea1.mov                              →  UGC Lea 1
```

### 4.3 Whitelist

Exported constant in `lib/media.ts`, with a comment saying what it is for and that
adding an entry is the whole edit:

```ts
export const KEEP_CAPS = ["UGC", "HKP", "PDL", "FSJ", "MA"];
```

Matching is whole-token, so `Maria 1` is untouched. A file named literally
`ma 2.mov` does become `MA 2` — intended, and the reason `MA` is worth knowing
about as the one two-letter entry.

### 4.4 Boundaries

- **Split ads are unaffected.** Their names come from `nextCreativeName()`
  (`Creative N`), not from a file.
- **Hand-edited names are unaffected.** Normalisation happens where a name is
  derived from a file, not on the way to Meta, so a name typed in the wizard
  reaches Meta as typed.
- **Pairing is unaffected.** `parseName()` lowercases its prefix already and does
  its own matching; it keeps using the raw file name.

---

## 5. Testing

`lib/launch.test.ts` already drives `launch()` with a fake `graph`; `LaunchDeps`
gains a `batch`.

**Path selection and batching**
- 8 ads use the pool, 9 use the batch — the boundary in both directions.
- 20 ads produce 4 chunks of 5.
- Emitted sub-requests carry `omit_response_on_success: false` on named creatives
  and a `{result=cr_<i>:$.id}` reference on the dependent ad.
- Ads from two ad sets share a chunk and keep their own `adset_id`.

**Error mapping**
- Rejected creative with a `null` dependent produces exactly one `failed` entry.
- Rejected ad after a fulfilled creative produces one `failed` entry.
- `null` ad after a fulfilled creative is reported as a timeout.

**Fallback**
- A chunk throwing `GraphError` is retried through the pool and its ads land in the
  receipt.
- A chunk throwing a non-`GraphError` is **not** retried, and the receipt says so.

**Equivalence**
- The same input yields the same `Receipt` (ad set ids, ad ids, failures) through
  both paths.

**Names** (`lib/media.test.ts`)
- Every row of the table in §4.2.
- Whitelist casing in both directions (`ugc` → `UGC`, `Maria` untouched).
- Empty-stem fallback.
- `uniqueName()` still separates `Lea 1.mov` and `Lea 1.mp4` after normalisation.

---

## 6. Out of scope

- Parallelising the batch chunks. Sequential chunks already take 20 ads to four
  calls; running them concurrently invites rate limits for about a second.
- Touching `verifyCampaign` — one call against seven is not where the time is.
- Uploads and `waitForVideo` polling. They happen before the button is clicked and
  are a separate concern (see the video transcode spec).
- `resolveLaunch`'s customer read. Cached for 300s and warm in practice.
