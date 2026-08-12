# Interactive Campaign Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `app/campaigns/new` with a creator that produces the agency's
standard job-ad campaign — lead form, radius targeting, Feed/Stories only, five
text variants, N ad sets — and verifies the result.

**Architecture:** Pure builders (`lib/targeting.ts`, `lib/naming.ts`) are unit-
tested with no network. `lib/launch.ts` orchestrates Graph calls and returns a
`Receipt` recording every created id. Uploads bypass Server Actions via a Route
Handler. The wizard holds client state and passes a typed object to one action.

**Tech Stack:** Next.js 16.3.0 (App Router, no `cacheComponents`), React 19.2.8,
HeroUI 3.2.4, Tailwind CSS 4, bun 1.3.14, Meta Graph API v26.0.

**Spec:** `docs/superpowers/specs/2026-08-12-campaign-creator-design.md`

## Global Constraints

- **No new dependencies.** Everything is covered by `@heroui/react@3.2.4`,
  `next@16.3.0`, `react@19.2.8`. If a task seems to need a package, it is the
  wrong task.
- **Before writing any HeroUI JSX**, read the sub-part names and props in
  `node_modules/@heroui/react/dist/components/<name>/index.d.ts`. Prop names have
  been wrong in earlier plans. `Button` has no `as` prop.
- **`defaultValue` goes on `TextField`, not `Input`** — React Aria treats it as
  controlled otherwise. See `app/campaigns/new/stepper.tsx:38`.
- **UI language is English.** Ad content, lead forms and campaign names are German.
- **Money is sent in cents.** `daily_budget`, `spend_cap`.
- **Everything is created with the campaign `PAUSED`**, ad sets and ads `ACTIVE`.
- **Tests run with `bun test`.** Pure functions only; no test hits Graph.
- **Commit after every task.** Conventional commit prefixes (`feat:`, `fix:`,
  `refactor:`, `test:`, `docs:`) matching existing history.
- Comments in this codebase are German and explain *why*, not *what*. Match that.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/naming.ts` | Compose campaign and ad set names, role codes | 1, **17** |
| `lib/naming.test.ts` | Name composition, date format | 1, **17** |
| `lib/targeting.ts` | geo + placements + special-category rules | 2 |
| `lib/targeting.test.ts` | Targeting builder | 2 |
| `lib/uploads.ts` | Upload image/video, poll, thumbnail (moved from `campaigns.ts`) | 3 |
| `app/api/upload/route.ts` | Route Handler: one file in, Meta id out | 4 |
| `lib/forms.ts` | List a page's lead forms, Instant Forms deep link | 5 |
| `lib/forms.test.ts` | Deep link composition | 5 |
| `lib/launch.ts` | Build creative, create tree, return `Receipt` | 6, 7 |
| `lib/launch.test.ts` | Creative shape, `Receipt` on partial failure | 6, 7 |
| `lib/verify.ts` | Read the tree back, assert intent | 8 |
| `lib/verify.test.ts` | Check logic against fixture trees | 8 |
| `lib/labels.ts` | Plain labels for Meta enum values | 18 |
| `lib/labels.test.ts` | Label lookup and passthrough | 18 |
| `lib/prefill.ts` | Defaults from the last campaign, Instagram id | 16 |
| `lib/prefill.test.ts` | Prefill extraction | 16 |
| `app/campaigns/actions.ts` | `launchAction` rewritten to take a typed object | 9 |
| `app/campaigns/new/state.ts` | Wizard state type, defaults, sessionStorage | 10 |
| `app/campaigns/new/wizard.tsx` | Stepper shell, 3 steps | 11 |
| `app/campaigns/new/ad-set-block.tsx` | The repeating block | 12 |
| `app/campaigns/new/preview.tsx` | Live preview with variant cycler | 13 |
| `app/campaigns/new/receipt.tsx` | Verification checklist | 14 |
| `app/campaigns/new/page.tsx` | Server component, loads customers + forms | 11 |
| `lib/campaigns.ts` | Trimmed: reads, insights, status/budget only | 3, 15 |

Deleted at the end: `app/campaigns/new/stepper.tsx`, `launch()` and the upload
helpers in `lib/campaigns.ts`.

---

## Task 1: Name composition

**Files:**
- Create: `lib/naming.ts`
- Test: `lib/naming.test.ts`

**Interfaces:**
- Produces: `campaignName(p: NameParts): string`,
  `adSetName(index: number, city?: string): string`,
  `type NameParts = { customer: string; position: string; start: Date; initials: string }`

- [ ] **Step 1: Write failing test**

```ts
// lib/naming.test.ts
import { expect, test } from "bun:test";
import { adSetName, campaignName } from "./naming";

test("campaign name follows the SOP pattern", () => {
  expect(
    campaignName({
      customer: "Palliativo",
      position: "FK inkl. PC-Weiterbildung",
      start: new Date(2026, 7, 6),
      initials: "KF",
    }),
  ).toBe("Palliativo - ges. FK inkl. PC-Weiterbildung ab 06.08.2026 KF");
});

test("day and month are zero padded", () => {
  const n = campaignName({
    customer: "X", position: "P", start: new Date(2026, 0, 3), initials: "AB",
  });
  expect(n).toContain("ab 03.01.2026");
});

test("the first ad set is Ads, later ones carry the city", () => {
  expect(adSetName(0)).toBe("Ads");
  expect(adSetName(1, "Dresden")).toBe("Ads – Dresden");
  expect(adSetName(1)).toBe("Ads 2");
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test lib/naming.test.ts`
Expected: FAIL — cannot resolve `./naming`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/naming.ts
/**
 * Kampagnennamen folgen einer festen Konvention der Agentur:
 * "Kunde - ges. Position ab TT.MM.JJJJ XX". Sie steht hier und nicht im
 * Formular, damit sie testbar ist und nicht per Hand getippt wird.
 */
export type NameParts = {
  customer: string;
  position: string;
  start: Date;
  initials: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export const formatDate = (d: Date) =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

export function campaignName(p: NameParts): string {
  return `${p.customer} - ges. ${p.position} ab ${formatDate(p.start)} ${p.initials}`;
}

// Der erste heißt immer "Ads"; erst bei mehreren Standorten braucht er den Ort.
export function adSetName(index: number, city?: string): string {
  if (index === 0) return "Ads";
  return city ? `Ads – ${city}` : `Ads ${index + 1}`;
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `bun test lib/naming.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/naming.ts lib/naming.test.ts
git commit -m "feat: compose campaign and ad set names from the SOP convention"
```

---

## Task 2: Targeting builder

**Files:**
- Create: `lib/targeting.ts`
- Test: `lib/targeting.test.ts`

**Interfaces:**
- Produces: `buildTargeting(i: TargetingInput): Targeting`, `PLACEMENTS`,
  `type TargetingInput = { addressString: string; radiusKm: number; countries?: string[] }`

Enum values are those observed in production (spec §5.2). Instagram's feed is
`stream`, not `feed`.

- [ ] **Step 1: Write failing test**

```ts
// lib/targeting.test.ts
import { expect, test } from "bun:test";
import { buildTargeting } from "./targeting";

const base = { addressString: "Hauptstr. 1, 01067 Dresden", radiusKm: 17 };

test("address and radius become a custom location in kilometres", () => {
  const t = buildTargeting(base);
  expect(t.geo_locations.custom_locations).toEqual([
    {
      address_string: "Hauptstr. 1, 01067 Dresden",
      radius: 17,
      distance_unit: "kilometer",
    },
  ]);
});

test("only feed and stories are targeted", () => {
  const t = buildTargeting(base);
  expect(t.publisher_platforms).toEqual(["facebook", "instagram"]);
  expect(t.facebook_positions).toEqual(["feed", "story"]);
  expect(t.instagram_positions).toEqual(["stream", "story"]);
});

test("age and gender are never sent — EMPLOYMENT forbids them", () => {
  const t = buildTargeting(base) as Record<string, unknown>;
  expect(t.age_min).toBeUndefined();
  expect(t.age_max).toBeUndefined();
  expect(t.genders).toBeUndefined();
});

test("radius outside Meta's 1-80 km range is rejected", () => {
  expect(() => buildTargeting({ ...base, radiusKm: 0.5 })).toThrow(/1 and 80/);
  expect(() => buildTargeting({ ...base, radiusKm: 81 })).toThrow(/1 and 80/);
});

test("a blank address is rejected before it reaches Graph", () => {
  expect(() => buildTargeting({ ...base, addressString: "  " })).toThrow(/address/i);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test lib/targeting.test.ts`
Expected: FAIL — cannot resolve `./targeting`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/targeting.ts
/**
 * Targeting für Stellenanzeigen. Alle Werte sind gegen bestehende Kampagnen
 * geprüft (siehe Spec §5.2) – "stream" ist Instagrams Feed, nicht "feed".
 * Alter und Geschlecht fehlen absichtlich: EMPLOYMENT verbietet beides.
 */
export const PLACEMENTS = {
  publisher_platforms: ["facebook", "instagram"],
  facebook_positions: ["feed", "story"],
  instagram_positions: ["stream", "story"],
} as const;

export type TargetingInput = {
  addressString: string;
  radiusKm: number;
  countries?: string[];
};

export type Targeting = {
  geo_locations: {
    custom_locations: {
      address_string: string;
      radius: number;
      distance_unit: "kilometer";
    }[];
  };
} & typeof PLACEMENTS;

export function buildTargeting(i: TargetingInput): Targeting {
  const address = i.addressString.trim();
  if (!address) throw new Error("An exact address is required for radius targeting.");
  // Metas Grenzen für custom_locations; darunter/darüber lehnt Graph erst
  // beim Anlegen der Anzeigengruppe ab – zu spät, um es sinnvoll zu zeigen.
  if (!(i.radiusKm >= 1 && i.radiusKm <= 80))
    throw new Error("Radius must be between 1 and 80 km.");

  return {
    geo_locations: {
      custom_locations: [
        { address_string: address, radius: i.radiusKm, distance_unit: "kilometer" },
      ],
    },
    ...PLACEMENTS,
  };
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `bun test lib/targeting.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/targeting.ts lib/targeting.test.ts
git commit -m "feat: targeting builder with radius and feed/stories placements"
```

---

## Task 3: Extract uploads from lib/campaigns.ts

Pure move, no behaviour change, so the later tasks can import uploads without
pulling in the campaign reads.

**Files:**
- Create: `lib/uploads.ts`
- Modify: `lib/campaigns.ts` — delete `uploadImage`, `uploadVideo`,
  `waitForVideo`, `videoThumbnail` (lines 105–154)

**Interfaces:**
- Produces: `uploadImage(file: File, acct?: string): Promise<string>` (returns hash),
  `uploadVideo(file: File, acct?: string): Promise<string>` (returns video id, waits
  for processing), `videoThumbnail(videoId: string): Promise<string>`

- [ ] **Step 1: Move the four functions verbatim**

Cut `uploadImage`, `uploadVideo`, `waitForVideo` and `videoThumbnail` from
`lib/campaigns.ts` into a new `lib/uploads.ts`. Add at the top:

```ts
/**
 * Upload von Bildern und Videos ins Werbekonto. Getrennt von campaigns.ts,
 * weil der Route Handler das hier braucht, aber keine Kampagnen-Reads.
 */
import { graph, meta } from "./graph";
```

Export `videoThumbnail` (it was module-private); the creative builder needs it.

- [ ] **Step 2: Fix the import in lib/campaigns.ts**

`lib/campaigns.ts` still contains `launch()` at this point, which calls the moved
functions. Add:

```ts
import { uploadImage, uploadVideo, videoThumbnail } from "./uploads";
```

Remove `meta` from the `./graph` import if it is now unused.

- [ ] **Step 3: Verify nothing broke**

Run: `bun test && bunx tsc --noEmit`
Expected: existing tests PASS, no type errors

- [ ] **Step 4: Commit**

```bash
git add lib/uploads.ts lib/campaigns.ts
git commit -m "refactor: extract uploads from campaigns into lib/uploads.ts"
```

---

## Task 4: Upload Route Handler

Server Actions dispatch one at a time per client and would serialise uploads, so
this is a Route Handler. See spec §4.1.

**Files:**
- Create: `app/api/upload/route.ts`

**Interfaces:**
- Produces: `POST /api/upload` — multipart body with `file` and `adAccount`;
  responds `{ kind: "video"; id: string; thumbnail: string }` or
  `{ kind: "image"; hash: string }` or `{ error: string }` with status 400/500.

- [ ] **Step 1: Write the handler**

```ts
// app/api/upload/route.ts
/**
 * Ein Upload pro Request. Bewusst ein Route Handler und keine Server Action:
 * Next schickt Actions pro Client streng nacheinander, damit würde jedes
 * Video das nächste blockieren – bei UGC-Batches minutenlang.
 */
import { uploadImage, uploadVideo, videoThumbnail } from "@/lib/uploads";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const adAccount = String(form.get("adAccount") ?? "");

  if (!(file instanceof File) || file.size === 0)
    return Response.json({ error: "No file received." }, { status: 400 });
  if (!adAccount)
    return Response.json({ error: "No ad account given." }, { status: 400 });

  try {
    if (file.type.startsWith("video/")) {
      const id = await uploadVideo(file, adAccount);
      return Response.json({ kind: "video", id, thumbnail: await videoThumbnail(id) });
    }
    return Response.json({ kind: "image", hash: await uploadImage(file, adAccount) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/api/upload/route.ts
git commit -m "feat: upload route handler so videos do not serialise behind actions"
```

---

## Task 5: Lead forms

**Files:**
- Create: `lib/forms.ts`
- Test: `lib/forms.test.ts`

**Interfaces:**
- Produces: `listLeadForms(pageId: string): Promise<LeadForm[]>`,
  `instantFormsUrl(pageId: string): string`,
  `type LeadForm = { id: string; name: string; status: string; locale?: string }`

Requires `pages_manage_ads` **and** the page assigned to the system user
(`bun run assign`). Without it Graph returns `(#10) User has insufficient
privileges on the page` — surface that verbatim rather than as an empty list.

- [ ] **Step 1: Write failing test**

```ts
// lib/forms.test.ts
import { expect, test } from "bun:test";
import { instantFormsUrl } from "./forms";

test("the deep link points at the page's Instant Forms library", () => {
  const url = new URL(instantFormsUrl("337164132803732"));
  expect(url.host).toBe("business.facebook.com");
  expect(url.pathname).toBe("/latest/instant_forms");
  expect(url.searchParams.get("asset_id")).toBe("337164132803732");
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test lib/forms.test.ts`
Expected: FAIL — cannot resolve `./forms`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/forms.ts
/**
 * Formulare werden in Meta gebaut, nicht hier – die bedingte Logik der Agentur
 * ist jedes Mal anders. Die App wählt nur aus und verlinkt zum Baukasten.
 */
import { graph, meta } from "./graph";

export type LeadForm = {
  id: string;
  name: string;
  status: string;
  locale?: string;
};

export async function listLeadForms(pageId: string): Promise<LeadForm[]> {
  const { data } = await graph<{ data: LeadForm[] }>(`${pageId}/leadgen_forms`, {
    params: { fields: "id,name,status,locale", limit: 100 },
    revalidate: 60,
    tags: ["forms", `forms:${pageId}`],
  });
  return (data ?? []).filter((f) => f.status !== "ARCHIVED");
}

export function instantFormsUrl(pageId: string): string {
  const url = new URL("https://business.facebook.com/latest/instant_forms");
  url.searchParams.set("asset_id", pageId);
  if (meta.business) url.searchParams.set("business_id", meta.business);
  return url.toString();
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `bun test lib/forms.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add lib/forms.ts lib/forms.test.ts
git commit -m "feat: list lead forms and deep-link to the Instant Forms builder"
```

---

## Task 6: Creative builder

The shape is copied from the agency's live creatives (spec §5.2):
`asset_feed_spec` carries only text, `object_story_spec` carries the video and the
form. Both are sent together.

**Files:**
- Create: `lib/launch.ts`
- Test: `lib/launch.test.ts`

**Interfaces:**
- Produces: `buildCreative(i: CreativeInput): CreativeParams`,
  `type CreativeInput = { pageId: string; instagramUserId?: string; videoId: string;
  thumbnailHash?: string; thumbnailUrl?: string; formId: string; bodies: string[];
  titles: string[]; description: string; callToAction?: string }`

- [ ] **Step 1: Write failing test**

```ts
// lib/launch.test.ts
import { expect, test } from "bun:test";
import { buildCreative } from "./launch";

const input = {
  pageId: "1189746767562744",
  instagramUserId: "17841436659257779",
  videoId: "1675767910156250",
  thumbnailUrl: "https://example.test/t.jpg",
  formId: "2095967427699237",
  bodies: ["b1", "b2", "b3", "b4", "b5"],
  titles: ["t1", "t2", "t3", "t4", "t5"],
  description: "d1",
};

test("the lead form hangs off the story spec, not the feed spec", () => {
  const c = buildCreative(input);
  expect(c.object_story_spec.video_data.call_to_action).toEqual({
    type: "APPLY_NOW",
    value: { lead_gen_form_id: "2095967427699237", link: "http://fb.me/" },
  });
  expect("onsite_destinations" in c.asset_feed_spec).toBe(false);
});

test("the feed spec carries only text variants", () => {
  const c = buildCreative(input);
  expect(c.asset_feed_spec.bodies).toEqual(input.bodies.map((text) => ({ text })));
  expect(c.asset_feed_spec.titles).toHaveLength(5);
  expect(c.asset_feed_spec.descriptions).toEqual([{ text: "d1" }]);
});

test("instagram uses the current field name", () => {
  const c = buildCreative(input);
  expect(c.object_story_spec.instagram_user_id).toBe("17841436659257779");
  expect("instagram_actor_id" in c.object_story_spec).toBe(false);
});

test("more than five bodies or titles is rejected", () => {
  expect(() => buildCreative({ ...input, bodies: Array(6).fill("x") })).toThrow(/5/);
  expect(() => buildCreative({ ...input, titles: Array(6).fill("x") })).toThrow(/5/);
});

test("at least one body and one title are required", () => {
  expect(() => buildCreative({ ...input, bodies: [] })).toThrow(/at least one/i);
});

test("standard enhancements stay opted out", () => {
  const c = buildCreative(input);
  expect(
    c.degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status,
  ).toBe("OPT_OUT");
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test lib/launch.test.ts`
Expected: FAIL — cannot resolve `./launch`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/launch.ts
/**
 * Anlegen einer Kampagne nach dem Standardablauf der Agentur.
 * Die Creative-Form ist aus laufenden Kampagnen abgelesen, nicht aus der Doku:
 * asset_feed_spec trägt nur Text, object_story_spec Video und Formular –
 * beide zusammen in einem Creative. onsite_destinations wird nicht benutzt.
 */
export type CreativeInput = {
  pageId: string;
  instagramUserId?: string;
  videoId: string;
  thumbnailHash?: string;
  thumbnailUrl?: string;
  formId: string;
  bodies: string[];
  titles: string[];
  description: string;
  callToAction?: string;
};

export function buildCreative(i: CreativeInput) {
  if (!i.bodies.length || !i.titles.length)
    throw new Error("At least one primary text and one headline are required.");
  if (i.bodies.length > 5 || i.titles.length > 5)
    throw new Error("Meta allows at most 5 primary texts and 5 headlines.");
  if (!i.formId) throw new Error("A lead form must be selected.");

  return {
    object_story_spec: {
      page_id: i.pageId,
      ...(i.instagramUserId ? { instagram_user_id: i.instagramUserId } : {}),
      video_data: {
        video_id: i.videoId,
        ...(i.thumbnailHash
          ? { image_hash: i.thumbnailHash }
          : { image_url: i.thumbnailUrl }),
        call_to_action: {
          type: i.callToAction ?? "APPLY_NOW",
          // link ist bei Lead-Ads ein Platzhalter – Meta verlangt ihn trotzdem.
          value: { lead_gen_form_id: i.formId, link: "http://fb.me/" },
        },
      },
    },
    asset_feed_spec: {
      bodies: i.bodies.map((text) => ({ text })),
      titles: i.titles.map((text) => ({ text })),
      descriptions: [{ text: i.description }],
    },
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: { enroll_status: "OPT_OUT" },
      },
    },
  };
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `bun test lib/launch.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/launch.ts lib/launch.test.ts
git commit -m "feat: creative builder pairing asset_feed_spec with the lead form"
```

---

## Task 7: Launch orchestration with a receipt

**Files:**
- Modify: `lib/launch.ts` — add `launch()` and the `Receipt` type
- Modify: `lib/launch.test.ts` — add receipt tests

**Interfaces:**
- Consumes: `buildCreative` (Task 6), `buildTargeting` (Task 2), `adSetName`
  (Task 1), `graph` from `lib/graph.ts`
- Produces: `launch(input: LaunchInput, deps?: LaunchDeps): Promise<Receipt>`

```ts
export type AdSetInput = {
  name: string;
  addressString: string;
  radiusKm: number;
  formId: string;
  instagramUserId?: string;
  bodies: string[];
  titles: string[];
  description: string;
  videos: { videoId: string; thumbnailUrl?: string; fileName: string }[];
  dailyBudgetCents?: number;
};

export type LaunchInput = {
  adAccount: string;
  pageId: string;
  campaignName: string;
  dailyBudgetCents: number;
  spendCapCents?: number;
  adSets: AdSetInput[];
  /** Vorhandene Kampagne weiterbauen statt neu anlegen (Retry). */
  existingCampaignId?: string;
};

export type Receipt = {
  campaignId?: string;
  adSets: { id?: string; name: string; adIds: string[]; error?: string }[];
  failed: { adSetName: string; fileName: string; error: string }[];
};
```

`deps` exists only so tests can inject a fake `graph`. Default is the real one.

- [ ] **Step 1: Write failing test**

```ts
// append to lib/launch.test.ts
import { launch } from "./launch";

function fakeGraph(fail?: (path: string, n: number) => boolean) {
  let n = 0;
  const calls: { path: string; params: any }[] = [];
  const g = async (path: string, opts: any = {}) => {
    n++;
    calls.push({ path, params: opts.params });
    if (fail?.(path, n)) throw new Error("boom");
    return { id: `${path.split("/").pop()}-${n}` };
  };
  return { g, calls };
}

const oneAdSet = {
  adAccount: "act_1",
  pageId: "p1",
  campaignName: "Kunde - ges. PFK ab 01.01.2026 AB",
  dailyBudgetCents: 1700,
  adSets: [
    {
      name: "Ads",
      addressString: "Hauptstr. 1, Dresden",
      radiusKm: 17,
      formId: "f1",
      bodies: ["b"],
      titles: ["t"],
      description: "d",
      videos: [
        { videoId: "v1", fileName: "a.mp4" },
        { videoId: "v2", fileName: "b.mp4" },
      ],
    },
  ],
};

test("the campaign is paused while ad sets and ads go live", async () => {
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  const campaign = calls.find((c) => c.path.endsWith("/campaigns"))!;
  expect(campaign.params.status).toBe("PAUSED");
  expect(campaign.params.special_ad_categories).toEqual(["EMPLOYMENT"]);
  expect(calls.find((c) => c.path.endsWith("/adsets"))!.params.status).toBe("ACTIVE");
  expect(calls.find((c) => c.path.endsWith("/ads"))!.params.status).toBe("ACTIVE");
});

test("the budget sits on the campaign, not the ad set", async () => {
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  expect(calls.find((c) => c.path.endsWith("/campaigns"))!.params.daily_budget).toBe(1700);
  expect(calls.find((c) => c.path.endsWith("/adsets"))!.params.daily_budget).toBeUndefined();
});

test("the ad set carries the lead form destination", async () => {
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  const set = calls.find((c) => c.path.endsWith("/adsets"))!.params;
  expect(set.destination_type).toBe("ON_AD");
  expect(set.optimization_goal).toBe("LEAD_GENERATION");
  expect(set.promoted_object).toEqual({ page_id: "p1" });
});

test("one ad per video", async () => {
  const { g } = fakeGraph();
  const r = await launch(oneAdSet, { graph: g });
  expect(r.adSets[0].adIds).toHaveLength(2);
  expect(r.failed).toHaveLength(0);
});

test("a failing ad is recorded without losing the ids already created", async () => {
  // 1 campaign, 2 adset, 3 creative, 4 ad, 5 creative, 6 ad -> fail the last
  const { g } = fakeGraph((path, n) => path.endsWith("/ads") && n === 6);
  const r = await launch(oneAdSet, { graph: g });
  expect(r.campaignId).toBeTruthy();
  expect(r.adSets[0].adIds).toHaveLength(1);
  expect(r.failed).toEqual([
    { adSetName: "Ads", fileName: "b.mp4", error: "boom" },
  ]);
});

test("a retry reuses the existing campaign instead of creating a second", async () => {
  const { g, calls } = fakeGraph();
  await launch({ ...oneAdSet, existingCampaignId: "c9" }, { graph: g });
  expect(calls.some((c) => c.path.endsWith("/campaigns"))).toBe(false);
  expect(calls.find((c) => c.path.endsWith("/adsets"))!.params.campaign_id).toBe("c9");
});

test("the spend cap is only sent when set", async () => {
  const { g, calls } = fakeGraph();
  await launch(oneAdSet, { graph: g });
  expect(calls[0].params.spend_cap).toBeUndefined();

  const second = fakeGraph();
  await launch({ ...oneAdSet, spendCapCents: 20000 }, { graph: second.g });
  expect(second.calls[0].params.spend_cap).toBe(20000);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test lib/launch.test.ts`
Expected: FAIL — `launch` is not exported

- [ ] **Step 3: Write minimal implementation**

Append to `lib/launch.ts`:

```ts
import { graph as realGraph } from "./graph";
import { buildTargeting } from "./targeting";

export type LaunchDeps = { graph: typeof realGraph };

export async function launch(
  input: LaunchInput,
  deps: LaunchDeps = { graph: realGraph },
): Promise<Receipt> {
  const { graph } = deps;
  const acct = input.adAccount;
  const receipt: Receipt = { adSets: [], failed: [] };

  // Kampagne pausiert, alles darunter aktiv: so startet Metas Prüfung sofort,
  // ohne dass Budget fließt. Genau die Reihenfolge des manuellen Ablaufs.
  if (input.existingCampaignId) {
    receipt.campaignId = input.existingCampaignId;
  } else {
    const campaign = await graph<{ id: string }>(`${acct}/campaigns`, {
      method: "POST",
      params: {
        name: input.campaignName,
        objective: "OUTCOME_LEADS",
        status: "PAUSED",
        special_ad_categories: ["EMPLOYMENT"],
        special_ad_category_country: ["DE"],
        daily_budget: input.dailyBudgetCents,
        ...(input.spendCapCents ? { spend_cap: input.spendCapCents } : {}),
      },
    });
    receipt.campaignId = campaign.id;
  }

  for (const set of input.adSets) {
    const entry: Receipt["adSets"][number] = { name: set.name, adIds: [] };
    receipt.adSets.push(entry);

    try {
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
    } catch (e) {
      entry.error = (e as Error).message;
      continue;
    }

    for (const video of set.videos) {
      try {
        const creative = await graph<{ id: string }>(`${acct}/adcreatives`, {
          method: "POST",
          params: {
            name: `${input.campaignName} – ${video.fileName}`,
            ...buildCreative({
              pageId: input.pageId,
              instagramUserId: set.instagramUserId,
              videoId: video.videoId,
              thumbnailUrl: video.thumbnailUrl,
              formId: set.formId,
              bodies: set.bodies,
              titles: set.titles,
              description: set.description,
            }),
          },
        });
        const ad = await graph<{ id: string }>(`${acct}/ads`, {
          method: "POST",
          params: {
            name: `${input.campaignName} – ${video.fileName}`,
            adset_id: entry.id,
            creative: { creative_id: creative.id },
            status: "ACTIVE",
          },
        });
        entry.adIds.push(ad.id);
      } catch (e) {
        receipt.failed.push({
          adSetName: set.name,
          fileName: video.fileName,
          error: (e as Error).message,
        });
      }
    }
  }

  return receipt;
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `bun test lib/launch.test.ts`
Expected: PASS (13 tests total in the file)

- [ ] **Step 5: Commit**

```bash
git add lib/launch.ts lib/launch.test.ts
git commit -m "feat: launch a campaign tree and report every created id"
```

---

## Task 8: Verification

Replaces SOP steps 14 and 16 — the checks currently done by eye.

**Files:**
- Create: `lib/verify.ts`
- Test: `lib/verify.test.ts`

**Interfaces:**
- Consumes: `graph` from `lib/graph.ts`
- Produces: `checkCampaign(tree: CampaignTree, intent: Intent): Check[]`,
  `type Check = { label: string; ok: boolean; detail?: string }`,
  `verifyCampaign(id: string, intent: Intent): Promise<Check[]>`

`verifyCampaign` reads its own fields rather than reusing `getCampaign`. The
existing `FIELDS` in `lib/campaigns.ts:92` requests
`creative{thumbnail_url,effective_object_story_id}`, which does **not** include
`object_story_spec` — the form id would always read as `undefined` and every form
check would fail.

`checkCampaign` is pure so it can be tested against fixtures; `verifyCampaign` is
the thin Graph wrapper around it.

- [ ] **Step 1: Write failing test**

```ts
// lib/verify.test.ts
import { expect, test } from "bun:test";
import { checkCampaign } from "./verify";

const intent = { formIds: { Ads: "f1" }, radiusKm: 17, adCount: 2 };

const good = {
  status: "PAUSED",
  adsets: {
    data: [
      {
        name: "Ads",
        status: "ACTIVE",
        targeting: {
          geo_locations: { custom_locations: [{ radius: 17 }] },
          facebook_positions: ["feed", "story"],
          instagram_positions: ["stream", "story"],
        },
        ads: {
          data: [
            { name: "a", status: "ACTIVE", creative: { object_story_spec: { video_data: { call_to_action: { value: { lead_gen_form_id: "f1" } } } } } },
            { name: "b", status: "ACTIVE", creative: { object_story_spec: { video_data: { call_to_action: { value: { lead_gen_form_id: "f1" } } } } } },
          ],
        },
      },
    ],
  },
};

test("a correctly built campaign passes every check", () => {
  const checks = checkCampaign(good as any, intent);
  expect(checks.every((c) => c.ok)).toBe(true);
});

test("an ad pointing at the wrong form fails the form check", () => {
  const bad = structuredClone(good);
  bad.adsets.data[0].ads.data[1].creative.object_story_spec.video_data.call_to_action.value.lead_gen_form_id = "WRONG";
  const check = checkCampaign(bad as any, intent).find((c) => c.label.includes("form"))!;
  expect(check.ok).toBe(false);
  expect(check.detail).toContain("b");
});

test("a live campaign fails the paused check", () => {
  const bad = { ...structuredClone(good), status: "ACTIVE" };
  expect(checkCampaign(bad as any, intent).find((c) => c.label.includes("paused"))!.ok).toBe(false);
});

test("a missing ad is caught by the count check", () => {
  const bad = structuredClone(good);
  bad.adsets.data[0].ads.data.pop();
  expect(checkCampaign(bad as any, intent).find((c) => c.label.includes("ads"))!.ok).toBe(false);
});

test("extra placements fail the placement check", () => {
  const bad = structuredClone(good);
  bad.adsets.data[0].targeting.facebook_positions.push("marketplace");
  expect(checkCampaign(bad as any, intent).find((c) => c.label.includes("Placements"))!.ok).toBe(false);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test lib/verify.test.ts`
Expected: FAIL — cannot resolve `./verify`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/verify.ts
/**
 * Liest die angelegte Kampagne zurück und prüft, was der Ablauf sonst per Auge
 * prüft: richtiges Formular an jeder Anzeige, alles veröffentlicht, Kampagne aus.
 */
import { graph } from "./graph";
import { PLACEMENTS } from "./targeting";

export type Check = { label: string; ok: boolean; detail?: string };
export type Intent = {
  formIds: Record<string, string>;
  radiusKm: number;
  adCount: number;
};

const formOf = (ad: any) =>
  ad?.creative?.object_story_spec?.video_data?.call_to_action?.value?.lead_gen_form_id;

const same = (a: string[] = [], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function checkCampaign(tree: any, intent: Intent): Check[] {
  const sets = tree?.adsets?.data ?? [];
  const ads = sets.flatMap((s: any) => s.ads?.data ?? []);

  const wrongForm = sets.flatMap((s: any) =>
    (s.ads?.data ?? [])
      .filter((a: any) => formOf(a) !== intent.formIds[s.name])
      .map((a: any) => a.name),
  );
  const notLive = ads.filter((a: any) => a.status !== "ACTIVE").map((a: any) => a.name);
  const badPlacement = sets
    .filter(
      (s: any) =>
        !same(s.targeting?.facebook_positions, PLACEMENTS.facebook_positions) ||
        !same(s.targeting?.instagram_positions, PLACEMENTS.instagram_positions),
    )
    .map((s: any) => s.name);
  const badRadius = sets
    .filter(
      (s: any) =>
        s.targeting?.geo_locations?.custom_locations?.[0]?.radius !== intent.radiusKm,
    )
    .map((s: any) => s.name);

  return [
    {
      label: `All ${intent.adCount} ads created`,
      ok: ads.length === intent.adCount,
      detail: ads.length === intent.adCount ? undefined : `found ${ads.length}`,
    },
    {
      label: "Every ad uses the intended lead form",
      ok: wrongForm.length === 0,
      detail: wrongForm.join(", ") || undefined,
    },
    { label: "Every ad is published", ok: notLive.length === 0, detail: notLive.join(", ") || undefined },
    {
      label: "Placements limited to feed and stories",
      ok: badPlacement.length === 0,
      detail: badPlacement.join(", ") || undefined,
    },
    {
      label: `Radius is ${intent.radiusKm} km`,
      ok: badRadius.length === 0,
      detail: badRadius.join(", ") || undefined,
    },
    { label: "Campaign is paused", ok: tree?.status === "PAUSED", detail: tree?.status },
  ];
}

// Eigener Read statt getCampaign: dort fehlt object_story_spec, ohne das die
// Formular-Prüfung immer "undefined" sähe und grundlos fehlschlüge.
const VERIFY_FIELDS =
  "status,adsets{name,status,targeting,ads{name,status,creative{object_story_spec}}}";

export async function verifyCampaign(id: string, intent: Intent): Promise<Check[]> {
  const tree = await graph(id, { params: { fields: VERIFY_FIELDS } });
  return checkCampaign(tree, intent);
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `bun test lib/verify.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/verify.ts lib/verify.test.ts
git commit -m "feat: verify the created campaign instead of checking it by eye"
```

---

## Task 9: Rewrite the launch action

**Files:**
- Modify: `app/campaigns/actions.ts` — replace `launchAction`, keep
  `setStatusAction` and `setBudgetAction` untouched

**Interfaces:**
- Consumes: `launch`, `Receipt`, `LaunchInput` (Task 7), `verifyCampaign` (Task 8),
  `listCustomers` from `lib/customers.ts`
- Produces: `launchAction(prev: LaunchState, input: WizardSubmission): Promise<LaunchState>`

```ts
export type WizardSubmission = Omit<LaunchInput, "adAccount" | "pageId"> & {
  customerId: string;
  adAccount?: string;
};
export type LaunchState = {
  receipt?: Receipt;
  checks?: Check[];
  error?: string;
};
```

The action takes an object, not `FormData` — nested repeating state does not
survive flattening into hidden inputs (see `7e63d01`).

- [ ] **Step 1: Replace launchAction**

```ts
// app/campaigns/actions.ts — replace the existing launchAction
import { updateTag } from "next/cache";
import { launch, type LaunchInput, type Receipt } from "@/lib/launch";
import { verifyCampaign, type Check } from "@/lib/verify";
import { listCustomers } from "@/lib/customers";

export type WizardSubmission = Omit<LaunchInput, "adAccount" | "pageId"> & {
  customerId: string;
  adAccount?: string;
};

export type LaunchState = { receipt?: Receipt; checks?: Check[]; error?: string };

export async function launchAction(
  _prev: LaunchState,
  input: WizardSubmission,
): Promise<LaunchState> {
  // Konto und Seite kommen vom Kunden, nicht vom Client – sonst zeigt ein
  // manipuliertes Feld auf ein fremdes Werbekonto.
  const { customers } = await listCustomers();
  const customer = customers.find((c) => c.id === input.customerId);
  if (!customer?.page) return { error: "Pick a customer with a connected page." };
  const adAccount = input.adAccount ?? customer.adAccounts[0]?.id;
  if (!adAccount) return { error: `${customer.name} has no ad account assigned.` };

  if (!input.adSets.length) return { error: "Add at least one ad set." };
  for (const s of input.adSets) {
    if (!s.videos.length) return { error: `“${s.name}” has no videos.` };
    if (!s.formId) return { error: `“${s.name}” has no lead form selected.` };
  }
  if (input.spendCapCents !== undefined && input.spendCapCents < 10000)
    return { error: "The spend cap must be at least 100 €." };

  try {
    const receipt = await launch({ ...input, adAccount, pageId: customer.page.id });
    updateTag("campaigns");
    const checks = receipt.campaignId
      ? await verifyCampaign(receipt.campaignId, {
          formIds: Object.fromEntries(input.adSets.map((s) => [s.name, s.formId])),
          radiusKm: input.adSets[0].radiusKm,
          adCount: input.adSets.reduce((n, s) => n + s.videos.length, 0),
        })
      : undefined;
    return { receipt, checks };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
```

- [ ] **Step 2: Verify types**

Run: `bunx tsc --noEmit`
Expected: errors only in `app/campaigns/new/stepper.tsx`, which Task 15 deletes

- [ ] **Step 3: Commit**

```bash
git add app/campaigns/actions.ts
git commit -m "feat: launch action taking typed wizard state and verifying the result"
```

---

## Task 10: Wizard state

**Files:**
- Create: `app/campaigns/new/state.ts`

**Interfaces:**
- Produces: `type WizardState`, `emptyAdSet(index, city?)`, `initialState(defaults)`,
  `useWizardState(defaults)` returning `[state, setState]` mirrored to sessionStorage

- [ ] **Step 1: Write the state module**

```ts
// app/campaigns/new/state.ts
"use client";

import { useEffect, useState } from "react";
import { adSetName } from "@/lib/naming";
import type { AdSetInput } from "@/lib/launch";

const KEY = "medarbeiter:new-campaign";

export type WizardState = {
  /** Das Werbekonto, unter dem angelegt wird – fast immer MedArbeiter. */
  customerId: string;
  /** Der beworbene Kunde. Nicht dasselbe wie customerId. */
  business: string;
  roles: string[];
  roleFreeText: string;
  startDate: string; // yyyy-mm-dd, so it round-trips through sessionStorage
  initials: string;
  campaignName: string;
  /** true, sobald der Name von Hand geändert wurde – dann nicht mehr überschreiben. */
  nameEdited: boolean;
  dailyBudgetEuros: number;
  spendCapEuros?: number;
  adSets: AdSetInput[];
};

export const emptyAdSet = (index: number, city?: string): AdSetInput => ({
  name: adSetName(index, city),
  addressString: "",
  radiusKm: 17,
  formId: "",
  bodies: [""],
  titles: [""],
  description: "",
  videos: [],
});

export const initialState = (customerId = "", initials = ""): WizardState => ({
  customerId,
  business: "",
  roles: [],
  roleFreeText: "",
  startDate: new Date().toISOString().slice(0, 10),
  initials,
  campaignName: "",
  nameEdited: false,
  dailyBudgetEuros: 17,
  adSets: [emptyAdSet(0)],
});

// sessionStorage statt Datenbank: Der Entwurf muss nur einen Reload überleben,
// die hochgeladenen Videos liegen ohnehin schon im Werbekonto.
export function useWizardState(defaults: WizardState) {
  const [state, setState] = useState<WizardState>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      try {
        setState(JSON.parse(raw) as WizardState);
      } catch {
        // kaputter Entwurf ist kein Grund, die Seite nicht zu zeigen
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) sessionStorage.setItem(KEY, JSON.stringify(state));
  }, [state, loaded]);

  return [state, setState, () => sessionStorage.removeItem(KEY)] as const;
}
```

- [ ] **Step 2: Verify types**

Run: `bunx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add app/campaigns/new/state.ts
git commit -m "feat: wizard state with a draft that survives a reload"
```

---

## Task 11: Wizard shell

**Files:**
- Create: `app/campaigns/new/wizard.tsx`
- Modify: `app/campaigns/new/page.tsx` — render `Wizard`, load customers and forms

**Interfaces:**
- Consumes: `useWizardState` (10), `campaignName` + `ROLES` (17), `LABELS` (18),
  `launchAction` (9), `AdSetBlock` (12), `Preview` (13), `ReceiptPanel` (14)
- Produces: `<Wizard customers={...} knownInitials={...} defaultCustomer={...} />`

**Before writing JSX**, read `node_modules/@heroui/react/dist/components/tabs/index.d.ts`
and `.../number-field/index.d.ts` for exact sub-part names.

- [ ] **Step 1: Write the shell**

Three `Tabs.Panel`s: `0` Campaign, `1` Ad sets, `2` Review. Step 1 fields per spec
§3 — note **Business name is its own field, not derived from the customer**. The
customer select defaults to MedArbeiter; the business name autocompletes against the
customer list but accepts any text, because the client may not be in the config.

Roles are a multi-select over `ROLES` (Task 17) plus a free-text field for one-offs
like `Koch` or `FK inkl. PC-Weiterbildung`. Initials are a select over
`knownInitials` with a free-text fallback.

Every technical value shown anywhere in this component — including inside the
`Advanced` disclosure — must render through `LABELS` (Task 18), never raw.

The composed name updates from parts while `nameEdited` is false:

```tsx
// key logic inside Wizard, not the whole file
const composed = campaignName({
  business: state.business,
  roles: state.roles,
  roleFreeText: state.roleFreeText,
  start: new Date(state.startDate),
  initials: state.initials,
});
useEffect(() => {
  if (!state.nameEdited) setState((s) => ({ ...s, campaignName: composed }));
}, [composed, state.nameEdited]);
```

Submit through `useActionState` with the object form:

```tsx
const [result, submit, pending] = useActionState(launchAction, {});
const onCreate = () =>
  startTransition(() =>
    submit({
      customerId: state.customerId,
      campaignName: state.campaignName,
      dailyBudgetCents: Math.round(state.dailyBudgetEuros * 100),
      spendCapCents: state.spendCapEuros
        ? Math.round(state.spendCapEuros * 100)
        : undefined,
      adSets: state.adSets,
    }),
  );
```

Step 2 maps `state.adSets` to `<AdSetBlock>` with an `Add location` button
appending `emptyAdSet(state.adSets.length)`. Step 3 renders a summary plus
`<ReceiptPanel>` once `result.receipt` exists.

The `Advanced` disclosure holds objective, optimisation goal, destination type,
placements and per-ad-set budget, all read-only in v1 apart from budget.

- [ ] **Step 2: Update page.tsx**

```tsx
// app/campaigns/new/page.tsx
import { listCustomers } from "@/lib/customers";
import { Wizard } from "./wizard";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  const { customers } = await listCustomers();
  // Ohne Werbekonto oder Seite lässt sich nichts anlegen – gar nicht erst anbieten.
  const usable = customers.filter((c) => c.page && c.adAccounts.length);
  return (
    <Wizard
      customers={usable.map((c) => ({
        id: c.id,
        name: c.name,
        pageId: c.page!.id,
        adAccounts: c.adAccounts.map((a) => ({ id: a.id, name: a.name })),
      }))}
      initials={process.env.META_INITIALS ?? ""}
      defaultCustomer={customer}
    />
  );
}
```

- [ ] **Step 3: Verify it renders**

Run: `bun dev`, open `http://localhost:3000/campaigns/new`
Expected: three tabs, campaign name composing as you type position and initials

- [ ] **Step 4: Commit**

```bash
git add app/campaigns/new/wizard.tsx app/campaigns/new/page.tsx
git commit -m "feat: three-step campaign wizard with a composed name"
```

---

## Task 12: Ad set block

**Files:**
- Create: `app/campaigns/new/ad-set-block.tsx`

**Interfaces:**
- Consumes: `listLeadForms`, `instantFormsUrl` (5), `POST /api/upload` (4)
- Produces: `<AdSetBlock value={adSet} index={i} pageId adAccount onChange onRemove />`

- [ ] **Step 1: Write the block**

Fields per spec §3 step 2. Two behaviours matter:

**Upload on pick** — parallel, because the Route Handler is not queued:

```tsx
async function onFiles(files: FileList) {
  const uploads = [...files].map(async (file) => {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("adAccount", adAccount);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (json.error) throw new Error(`${file.name}: ${json.error}`);
    return { videoId: json.id, thumbnailUrl: json.thumbnail, fileName: file.name };
  });
  const done = await Promise.allSettled(uploads);
  onChange({
    ...value,
    videos: [
      ...value.videos,
      ...done.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    ],
  });
  setErrors(done.flatMap((r) => (r.status === "rejected" ? [String(r.reason)] : [])));
}
```

**Form select with a create button** — forms load per page and refresh on demand:

```tsx
<Button onPress={() => window.open(instantFormsUrl(pageId), "_blank")}>
  Create form in Meta
</Button>
<Button onPress={refreshForms}>Refresh</Button>
```

Texts are `bodies` and `titles` arrays capped at 5, each with add/remove, plus one
`description`. Show a character counter against 1024 (bodies) and 255 (titles).

- [ ] **Step 2: Verify uploads work end to end**

Run: `bun dev`, pick two short videos in one block
Expected: both upload in parallel, thumbnails appear, `videos` has two entries

- [ ] **Step 3: Commit**

```bash
git add app/campaigns/new/ad-set-block.tsx
git commit -m "feat: ad set block with parallel uploads and lead form selection"
```

---

## Task 13: Preview

**Files:**
- Create: `app/campaigns/new/preview.tsx`

**Interfaces:**
- Produces: `<Preview adSet={AdSetInput} pageName={string} />`

- [ ] **Step 1: Write the preview**

Shows the first video thumbnail, the selected body and title, and arrows to step
through the five variants — the texts are written for the preview, not the fields.

```tsx
const [variant, setVariant] = useState(0);
const body = adSet.bodies[variant] ?? adSet.bodies[0];
const title = adSet.titles[variant] ?? adSet.titles[0];
```

Falls back to the existing placeholder box when no video has been uploaded yet.

- [ ] **Step 2: Verify**

Run: `bun dev`
Expected: cycling variants swaps both body and headline

- [ ] **Step 3: Commit**

```bash
git add app/campaigns/new/preview.tsx
git commit -m "feat: live preview cycling through the text variants"
```

---

## Task 14: Receipt panel

**Files:**
- Create: `app/campaigns/new/receipt.tsx`

**Interfaces:**
- Consumes: `Receipt` (7), `Check` (8), `WizardSubmission` (9)
- Produces: `<ReceiptPanel state={LaunchState} submission={WizardSubmission}
  onRetry={(input: WizardSubmission) => void} />`

`submission` is the object that was sent, passed back in so the retry can rebuild
the failed subset. Without it the panel has ids but no inputs to resend.

- [ ] **Step 1: Write the panel**

Renders the checklist from `state.checks` with pass/fail per row, the created ids
with links to the Ads Manager, and — when `state.receipt.failed` is non-empty — a
`Retry failed ads` button that resubmits with `existingCampaignId` set and only the
failed videos, so nothing is created twice.

```tsx
const retryInput = {
  ...submission,
  existingCampaignId: state.receipt!.campaignId,
  adSets: state.receipt!.adSets
    .map((set) => ({
      ...submission.adSets.find((s) => s.name === set.name)!,
      videos: submission.adSets
        .find((s) => s.name === set.name)!
        .videos.filter((v) =>
          state.receipt!.failed.some(
            (f) => f.adSetName === set.name && f.fileName === v.fileName,
          ),
        ),
    }))
    .filter((s) => s.videos.length),
};
```

- [ ] **Step 2: Verify**

Run: `bun dev`, create a campaign against a test ad account
Expected: all six checks pass, ids listed

- [ ] **Step 3: Commit**

```bash
git add app/campaigns/new/receipt.tsx
git commit -m "feat: verification checklist with retry for failed ads"
```

---

## Task 15: Remove the old creator

**Files:**
- Delete: `app/campaigns/new/stepper.tsx`
- Modify: `lib/campaigns.ts` — delete `launch()`, `LaunchInput`, `linkFields`,
  `videoStory` (everything below the `Kampagne → Anzeigengruppe → Anzeigen` header)
- Modify: `README.md` — update the `/campaigns` section

- [ ] **Step 1: Delete**

```bash
rm app/campaigns/new/stepper.tsx
```

Remove the launch section from `lib/campaigns.ts` and the now-unused
`uploads` import if nothing else in the file uses it.

- [ ] **Step 2: Verify nothing references them**

Run: `grep -rn "stepper\|from \"@/lib/campaigns\"" app lib | grep -v node_modules`
Expected: no reference to `stepper`; `lib/campaigns` imports only for reads

- [ ] **Step 3: Full check**

Run: `bun test && bunx tsc --noEmit && bun run build`
Expected: all tests pass, no type errors, build succeeds

- [ ] **Step 4: Update README**

Replace the `/campaigns` bullet with a description of the wizard, the
`pages_manage_ads` requirement and the `bun run assign` prerequisite for forms.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: drop the generic launch form in favour of the wizard"
```

---

## Task 16: Prefill and the Instagram account

Spec §3 requires both, and no earlier task provides them. Additive, so it can run
after the wizard exists.

**Files:**
- Create: `lib/prefill.ts`
- Test: `lib/prefill.test.ts`
- Modify: `app/campaigns/new/page.tsx` — pass `prefill` and `instagramUserId`

**Interfaces:**
- Consumes: `graph` from `lib/graph.ts`
- Produces: `lastCampaignDefaults(adAccount: string): Promise<Prefill | undefined>`,
  `pageInstagramId(pageId: string): Promise<string | undefined>`,
  `type Prefill = { addressString?: string; radiusKm?: number; bodies?: string[];
  titles?: string[]; description?: string }`

- [ ] **Step 1: Write failing test**

```ts
// lib/prefill.test.ts
import { expect, test } from "bun:test";
import { defaultsFromAdSet } from "./prefill";

test("address, radius and texts come from the previous ad set", () => {
  const p = defaultsFromAdSet({
    targeting: {
      geo_locations: {
        custom_locations: [{ address_string: "Hauptstr. 1, Dresden", radius: 25 }],
      },
    },
    ads: {
      data: [
        {
          creative: {
            asset_feed_spec: {
              bodies: [{ text: "b1" }, { text: "b2" }],
              titles: [{ text: "t1" }],
              descriptions: [{ text: "d1" }],
            },
          },
        },
      ],
    },
  } as any);

  expect(p.addressString).toBe("Hauptstr. 1, Dresden");
  expect(p.radiusKm).toBe(25);
  expect(p.bodies).toEqual(["b1", "b2"]);
  expect(p.titles).toEqual(["t1"]);
  expect(p.description).toBe("d1");
});

test("an ad set without a custom location yields no address", () => {
  const p = defaultsFromAdSet({ targeting: { geo_locations: { countries: ["DE"] } } } as any);
  expect(p.addressString).toBeUndefined();
  expect(p.radiusKm).toBeUndefined();
});

test("a lead form is never prefilled — it differs every campaign", () => {
  const p = defaultsFromAdSet({} as any) as Record<string, unknown>;
  expect(p.formId).toBeUndefined();
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test lib/prefill.test.ts`
Expected: FAIL — cannot resolve `./prefill`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/prefill.ts
/**
 * Vorbelegung aus der letzten Kampagne des Kunden. Meta ist der einzige Speicher
 * der App – Adresse und Texte stehen schon in der vorherigen Anzeigengruppe.
 * Das Formular wird bewusst nicht übernommen: es ist jedes Mal ein anderes.
 */
import { graph } from "./graph";

export type Prefill = {
  addressString?: string;
  radiusKm?: number;
  bodies?: string[];
  titles?: string[];
  description?: string;
};

const texts = (a?: { text: string }[]) => a?.map((x) => x.text);

export function defaultsFromAdSet(set: any): Prefill {
  const loc = set?.targeting?.geo_locations?.custom_locations?.[0];
  const feed = set?.ads?.data?.[0]?.creative?.asset_feed_spec;
  return {
    addressString: loc?.address_string,
    radiusKm: loc?.radius,
    bodies: texts(feed?.bodies),
    titles: texts(feed?.titles),
    description: texts(feed?.descriptions)?.[0],
  };
}

export async function lastCampaignDefaults(
  adAccount: string,
): Promise<Prefill | undefined> {
  const { data } = await graph<{ data: any[] }>(`${adAccount}/adsets`, {
    params: {
      fields:
        "created_time,targeting,ads.limit(1){creative{asset_feed_spec}}",
      limit: 1,
    },
    revalidate: 300,
    tags: ["campaigns"],
  });
  return data?.[0] ? defaultsFromAdSet(data[0]) : undefined;
}

export async function pageInstagramId(pageId: string): Promise<string | undefined> {
  // Braucht die Seite am System-Nutzer (bun run assign) – fehlt sie, ist das
  // kein Grund, den Assistenten zu blockieren.
  try {
    const r = await graph<{ instagram_business_account?: { id: string } }>(pageId, {
      params: { fields: "instagram_business_account" },
      revalidate: 3600,
      tags: ["assets"],
    });
    return r.instagram_business_account?.id;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `bun test lib/prefill.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire into the wizard**

In `page.tsx`, resolve `pageInstagramId` per usable customer and pass it down;
`AdSetBlock` shows it read-only as "Posting as @… on Instagram" or "Facebook page
only" when absent, and puts it into `adSet.instagramUserId`.

In `Wizard`, when `customerId` changes and the ad sets are still untouched, call a
small server action wrapping `lastCampaignDefaults` and merge the result into
`adSets[0]`. Never overwrite a field the user has already typed into.

- [ ] **Step 6: Commit**

```bash
git add lib/prefill.ts lib/prefill.test.ts app/campaigns/new/page.tsx app/campaigns/new/wizard.tsx app/campaigns/new/ad-set-block.tsx
git commit -m "feat: prefill from the last campaign and resolve the Instagram account"
```

---

## Task 17: Revise the name builder

Supersedes Task 1's format after the SOP owner corrected it mid-execution. Run this
**before** Task 11, which consumes it.

**Files:**
- Modify: `lib/naming.ts` — replace `campaignName`, keep `adSetName` and `formatDate`
- Modify: `lib/naming.test.ts` — replace the campaign-name tests

**Interfaces:**
- Produces: `campaignName(p: NameParts): string`, `ROLES: { code: string; label: string }[]`,
  `type NameParts = { business: string; roles: string[]; roleFreeText?: string; start: Date; initials: string }`
- Unchanged: `adSetName(index, city?)`, and `formatDate` stays exported but is no
  longer used by `campaignName` — the campaign name needs a 2-digit year.

- [ ] **Step 1: Replace the campaign-name tests**

```ts
// lib/naming.test.ts — replace the two campaignName tests, keep the adSetName test
import { expect, test } from "bun:test";
import { adSetName, campaignName, formatDate, ROLES } from "./naming";

test("the campaign name follows the agency convention", () => {
  expect(
    campaignName({
      business: "Herzhalt Pflegedienst GmbH",
      roles: ["FK"],
      start: new Date(2026, 7, 12),
      initials: "MH",
    }),
  ).toBe("Herzhalt Pflegedienst GmbH - FK ab 12.08.26 MH (via One)");
});

test("several roles are joined with a slash", () => {
  const n = campaignName({
    business: "X", roles: ["FK", "HK"], start: new Date(2026, 0, 3), initials: "KF",
  });
  expect(n).toBe("X - FK/HK ab 03.01.26 KF (via One)");
});

test("free text is appended after the codes", () => {
  const n = campaignName({
    business: "X", roles: ["FK"], roleFreeText: "inkl. PC-Weiterbildung",
    start: new Date(2026, 0, 3), initials: "KF",
  });
  expect(n).toBe("X - FK inkl. PC-Weiterbildung ab 03.01.26 KF (via One)");
});

test("free text alone works, for roles with no code", () => {
  const n = campaignName({
    business: "X", roles: [], roleFreeText: "Koch",
    start: new Date(2026, 0, 3), initials: "KF",
  });
  expect(n).toBe("X - Koch ab 03.01.26 KF (via One)");
});

test("the year is two digits, unlike formatDate", () => {
  expect(formatDate(new Date(2026, 7, 12))).toBe("12.08.2026");
  expect(
    campaignName({ business: "X", roles: ["FK"], start: new Date(2026, 7, 12), initials: "AB" }),
  ).toContain("ab 12.08.26 ");
});

test("every role code has a label", () => {
  expect(ROLES.length).toBeGreaterThan(0);
  for (const r of ROLES) {
    expect(r.code).toMatch(/^[A-Z]+$/);
    expect(r.label.length).toBeGreaterThan(0);
  }
});

test("the first ad set is Ads, later ones carry the city", () => {
  expect(adSetName(0)).toBe("Ads");
  expect(adSetName(1, "Dresden")).toBe("Ads – Dresden");
  expect(adSetName(1)).toBe("Ads 2");
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bun test lib/naming.test.ts`
Expected: FAIL — `ROLES` is not exported, and the name format does not match

- [ ] **Step 3: Rewrite `campaignName` and add `ROLES`**

```ts
// lib/naming.ts — replace NameParts and campaignName, keep formatDate and adSetName
/**
 * Kampagnennamen folgen einer festen Konvention der Agentur:
 * "Firma - Rollen ab TT.MM.JJ XX (via One)". Der Zusatz "(via One)" markiert,
 * was über diese App entstanden ist – die Altbestände heißen uneinheitlich.
 */
export type NameParts = {
  business: string;
  roles: string[];
  roleFreeText?: string;
  start: Date;
  initials: string;
};

/**
 * Aus echten Kampagnennamen abgelesen. Kombinationen sind normal, deshalb ist
 * die Auswahl mehrfach – und der Freitext bleibt, weil es Einzelfälle wie
 * "Koch" oder "Verwaltungskraft" gibt, die in kein Kürzel passen.
 * ponytail: Die Langtexte sind Vermutung außer FK und HK; sie stehen nur im UI,
 * nicht im Kampagnennamen, und sind hier in einer Zeile korrigierbar.
 */
export const ROLES = [
  { code: "FK", label: "Fachkräfte" },
  { code: "HK", label: "Hilfskräfte" },
  { code: "PFK", label: "Pflegefachkraft" },
  { code: "PDL", label: "Pflegedienstleitung" },
  { code: "MA", label: "Mitarbeiter" },
  { code: "PA", label: "Pflegeassistenz" },
  { code: "PH", label: "Pflegehelfer" },
] as const;

// Zweistelliges Jahr – formatDate bleibt vierstellig, das braucht die Anzeige.
const shortDate = (d: Date) =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;

export function campaignName(p: NameParts): string {
  const what = [p.roles.join("/"), p.roleFreeText?.trim()]
    .filter(Boolean)
    .join(" ");
  return `${p.business} - ${what} ab ${shortDate(p.start)} ${p.initials} (via One)`;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `bun test lib/naming.test.ts` then `bun test`
Expected: 7 pass in the file; whole suite green

- [ ] **Step 5: Commit**

```bash
git add lib/naming.ts lib/naming.test.ts
git commit -m "feat: rebuild the campaign name from business, roles and initials"
```

---

## Task 18: Plain labels for technical values

Meta's enum values must never reach the screen raw.

**Files:**
- Create: `lib/labels.ts`
- Test: `lib/labels.test.ts`

**Interfaces:**
- Produces: `label(value: string): string`, `LABELS: Record<string, string>`

- [ ] **Step 1: Write the failing test**

```ts
// lib/labels.test.ts
import { expect, test } from "bun:test";
import { label } from "./labels";

test("objectives, goals and events read as plain language", () => {
  expect(label("OUTCOME_LEADS")).toBe("Leads");
  expect(label("LEAD_GENERATION")).toBe("Maximise leads");
  expect(label("IMPRESSIONS")).toBe("Impressions");
  expect(label("ON_AD")).toBe("Instant form");
  expect(label("EMPLOYMENT")).toBe("Employment");
});

test("countries and placements read as plain language", () => {
  expect(label("DE")).toBe("Germany");
  expect(label("facebook")).toBe("Facebook");
  expect(label("stream")).toBe("Instagram feed");
  expect(label("story")).toBe("Stories");
});

test("an unknown value is returned unchanged rather than hidden", () => {
  expect(label("SOMETHING_NEW")).toBe("SOMETHING_NEW");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun test lib/labels.test.ts`
Expected: FAIL — cannot resolve `./labels`

- [ ] **Step 3: Write the implementation**

```ts
// lib/labels.ts
/**
 * Metas Enum-Werte gehören nicht auf den Bildschirm. Unbekanntes wird
 * unverändert durchgereicht – lieber ein technischer Wert als gar keiner.
 */
export const LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Leads",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  LEAD_GENERATION: "Maximise leads",
  LINK_CLICKS: "Link clicks",
  IMPRESSIONS: "Impressions",
  LOWEST_COST_WITHOUT_CAP: "Lowest cost",
  ON_AD: "Instant form",
  EMPLOYMENT: "Employment",
  APPLY_NOW: "Apply now",
  DE: "Germany",
  AT: "Austria",
  CH: "Switzerland",
  facebook: "Facebook",
  instagram: "Instagram",
  feed: "Feed",
  stream: "Instagram feed",
  story: "Stories",
  ACTIVE: "Active",
  PAUSED: "Paused",
};

export const label = (value: string): string => LABELS[value] ?? value;
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `bun test lib/labels.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/labels.ts lib/labels.test.ts
git commit -m "feat: plain labels so Meta enum values never reach the screen"
```

---

## Manual verification

Not automatable — needs a real ad account and a human.

- [ ] `bun run assign` has run and `bun --env-file=.env.local -e '...'` lists lead
      forms for a customer page without `(#10)`
- [ ] Create a campaign with **two** ad sets, different addresses and forms
- [ ] In the Ads Manager: campaign paused, ad sets and ads active
- [ ] Placements show Feed and Stories only, nothing else
- [ ] Each ad's form matches the one picked for its ad set
- [ ] The 17 km radius is centred on the entered address
- [ ] Five primary texts and five headlines are present on each ad
- [ ] Confirm with the SOP owner whether the radius should be 17 km or 25 km
      (spec §5.3)
