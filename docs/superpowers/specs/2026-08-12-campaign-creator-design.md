# MedArbeiter One — Interactive Campaign Creator

**Date:** 2026-08-12
**Status:** Approved, ready for implementation planning
**Scope:** Replace `app/campaigns/new` with a creator that produces the agency's standard job-ad campaign end to end

---

## 1. Purpose

The agency runs one play across ~200 care-sector clients: a lead-form campaign
advertising an open position, targeted at a radius around the client's address,
shown only in Feed and Stories, with one ad per UGC video.

That play is written down as a 17-step manual SOP in the Ads Manager. The current
creator (`app/campaigns/new/stepper.tsx`) is a generic five-objective builder that
produces **link ads to an external URL** — a different ad shape than the SOP
describes. It covers 7 of the 17 steps.

This document specifies a creator shaped around the SOP.

### The SOP, and where the app stands

| # | SOP step | Today |
|---|---|---|
| 1 | Name `Kunde - ges. Position ab TT.MM.JJJJ XX` | free text |
| 2 | Ausgabenlimit | not sent |
| 3 | Tagesbudget (17 €) | default 20 € |
| 4 | Ad set `Ads`, more when the client has several locations | hardcoded name, always exactly one |
| 5 | Conversion location: Instant Forms | **missing** — builds `link_data` |
| 6 | Client's Facebook page | ✅ from `customers.config.ts` |
| 7 | Performance goal: maximise leads | one of five dropdown values |
| 8 | Exact address, 17 km radius | **only `geo_locations.countries`** |
| 9 | Feed and Stories only | **nothing sent** → Advantage+ placements |
| 10 | One ad per UGC video | ✅ |
| 11 | 5 primary texts, 5 headlines, 1 description | 1 headline, 1 text |
| 12 | Select or create lead form, DE, conditional logic | **missing** |
| 13 | Verify Facebook page vs Instagram account | missing |
| 14 | Verify every ad points at the right form | missing |
| 15–17 | Publish, verify, set campaign inactive | creates everything paused |

### Decisions taken during design

| Question | Decision |
|---|---|
| Generic builder or SOP-shaped? | **SOP-shaped, with an `Advanced` disclosure** that unlocks the otherwise-fixed fields |
| Lead forms | **Select only.** Forms are built in Meta; a button deep-links to the right page |
| Per-customer master data (address, Instagram) | **None.** Entered per campaign, prefilled from the customer's last campaign |
| Ad sets per campaign | **N.** Each owns its address, form, texts and videos |
| Publishing | Ad sets and ads `ACTIVE`, campaign `PAUSED` |
| Budget placement | **Campaign level (CBO).** 50 of 61 live lead campaigns already do this; ad-set budgets sit behind `Advanced` |
| Special ad category | **Always `EMPLOYMENT`.** These are always job ads |
| Spend cap | **Optional**, minimum 100 € when set |
| UI language | **English**, consistent with the 2026-08-11 spec. Ad content and forms are German |
| Campaign name | Built from parts: `{Business} - {Roles} ab {TT.MM.JJ} {XX} (via One)` |
| Customer default | **MedArbeiter** — nearly all client campaigns run under the agency's own account |
| Technical enums | Never shown raw. Plain labels in the UI, raw values to the API |

### Explicitly out of scope

Lead form creation · conditional-logic editor · lead retrieval · editing budget or
schedule after launch · resumable upload · multi-format creatives · A/B tests.

---

## 2. What the creator produces

```
Campaign  ── OUTCOME_LEADS · PAUSED · special_ad_categories: [EMPLOYMENT]
  │          daily_budget 17 € (campaign level, CBO)
  │          spend_cap (optional, ≥ 100 €)
  │
  ├── Ad set "Ads" ── ACTIVE · LOWEST_COST_WITHOUT_CAP
  │     │             destination_type: ON_AD
  │     │             promoted_object: { page_id }
  │     │             optimization_goal: LEAD_GENERATION
  │     │             billing_event: IMPRESSIONS
  │     │             targeting: custom_locations[address, 17 km] + placements
  │     │
  │     ├── Ad ── ACTIVE · creative(asset_feed_spec: 1 video, 5 bodies,
  │     │                  5 titles, 1 description, form)
  │     └── Ad ── one per uploaded video
  │
  └── Ad set "Ads – Dresden" ── second location, own address/form/texts/videos
```

### Fixed by the SOP, hidden behind `Advanced`

```
objective              OUTCOME_LEADS
destination_type       ON_AD                     ← Instant Forms (step 5)
promoted_object        { page_id }
optimization_goal      LEAD_GENERATION           ← maximise leads (step 7)
billing_event          IMPRESSIONS
bid_strategy           LOWEST_COST_WITHOUT_CAP
special_ad_categories  ["EMPLOYMENT"]
publisher_platforms    ["facebook", "instagram"] ← step 9
facebook_positions     ["feed", "story"]
instagram_positions    ["stream", "story"]
```

These are the steps that silently revert to Advantage+ placements when nobody
switches them off by hand. `EMPLOYMENT` forces Meta's 18–65 age range, so age and
gender targeting are not offered at all.

---

## 3. Wizard

Three steps. Each ad set owns its own address, form, texts and videos, so
per-ad-set fields live in a repeating block rather than their own wizard step.

### Step 1 — Campaign

| Field | Behaviour |
|---|---|
| Customer | Select, **defaults to MedArbeiter**. Only customers with a page **and** at least one ad account are selectable |
| Business name | The **client** being advertised for — a separate field from the customer. Free text, autocompleting against `customers.config.ts` |
| Roles sought | Multi-select of role codes, plus a free-text escape |
| Start date | Date picker, defaults to today |
| Initials | Picker over known initials, remembers the last choice |
| Campaign name | Composed, shown, editable |
| Daily budget | Default 17 €. Set on the **campaign**; Meta distributes it across ad sets |
| Spend cap | Optional. When set, minimum 100 € |

The budget goes on the campaign, not the ad set — campaign budget optimisation.
This matches observed practice: of 61 live `OUTCOME_LEADS` campaigns, 50 carry a
campaign-level budget, 11 carry ad-set budgets, none carry both. So 17 € is the
campaign total however many ad sets exist. Per-ad-set budgets are available behind
`Advanced` for the minority case. Both `daily_budget` and `spend_cap` are sent in
cents, as `setDailyBudget` already does.

`spend_cap` is genuinely occasional — set on 15 of 61 campaigns, at values from
125 € to 3000 €. Hence optional rather than defaulted.

The name composes as:

```
{Business} - {Roles} ab {TT.MM.JJ} {XX} (via One)
Herzhalt Pflegedienst GmbH - FK/HK ab 12.08.26 MH (via One)
```

Editing the composed field detaches it from the parts; changing a part after that
re-composes and warns rather than silently overwriting.

**Customer and business name are different things.** Nearly every campaign is
created under the agency's own MedArbeiter ad account, while the name carries the
*client's* business name. Deriving one from the other would be wrong.

**Roles are multi-select.** Of 148 live campaign names, roughly a third combine
codes — `FK/HK`, `FK & HK`, `FK, PA`, `PFK, HK` — and one-offs like `Koch`,
`Verwaltungskraft` and `FK inkl. PC-Weiterbildung` exist, so a free-text escape is
required or those campaigns cannot be named at all. Codes are joined with `/`.

| Code | Meaning |
|---|---|
| `FK` | Fachkräfte |
| `HK` | Hilfskräfte |
| `PFK` | Pflegefachkraft |
| `PDL` | Pflegedienstleitung |
| `MA` | Mitarbeiter |
| `PA` | Pflegeassistenz |
| `PH` | Pflegehelfer |

The codes are taken from live campaign names and are certain. `FK` and `HK` were
confirmed by the SOP owner; the expansions of `PFK`, `PDL`, `MA`, `PA` and `PH` are
inferred and **await confirmation** — they are labels in one constant, cheap to
correct, and do not affect the strings written into campaign names.

**Initials are per-user, not per-install.** Live names show `MH`, `KF` and `PW`, so
a single `META_INITIALS` env value would be wrong. The picker offers the known set
and remembers the last choice in the same `sessionStorage` draft as the rest of the
wizard.

The existing convention is applied inconsistently — 2- and 4-digit years, dashes
before initials in some names and not others. The builder standardises it; the
`(via One)` suffix marks campaigns created through this app.

### Technical values are never shown raw

Meta's enum values appear in the UI only as plain labels, with the raw value sent to
the API: `OUTCOME_LEADS` → "Leads", `LEAD_GENERATION` → "Maximise leads",
`DE` → "Deutschland", `IMPRESSIONS` → "Impressions". This covers the `Advanced`
disclosure, where the otherwise-fixed values are displayed.

### Step 2 — Ad sets

A repeater. One block by default, named `Ads`. `Add location` clones an empty
block; the suggested name for the second and later blocks is `Ads – {Ort}`, derived
from the address once entered. Every suggested name stays editable.

Per block:

| Field | Behaviour |
|---|---|
| Name | Suggested, editable |
| Address | Street, postcode, city. Sent as `address_string`; Meta geocodes it |
| Radius | Default 17 km. Valid 1–80 km |
| Lead form | Select from the page's forms. `Create form in Meta` opens the Instant Forms library for that page in a new tab; `Refresh` re-reads the list |
| Instagram account | Read from the page. Shown as confirmation, not a choice, when only one exists |
| Videos | Multi-file. Each uploads immediately on pick |
| Primary texts | Up to 5, ≤ 1024 chars |
| Headlines | Up to 5, ≤ 255 chars |
| Description | 1, ≤ 255 chars |

Prefill: on customer selection the app reads that customer's most recent campaign
from Meta and prefills address, radius and texts from its first ad set. Meta stays
the only store — no new persistence layer.

### Step 3 — Review and create

A read-only summary of everything about to be created, then `Create`. After
creation the receipt replaces it (§5).

### Live preview

Beside the form, as today. Shows the real video thumbnail once uploaded, the first
primary text and headline, and a cycler to step through the five variants.

---

## 4. Architecture

### 4.1 Uploads move to file-pick time

`launch()` currently uploads every video sequentially inside one server action,
polling every 5 s for up to 5 minutes per video. Six UGC videos cannot complete
inside any serverless request; it survives today only because the app runs locally.

Each file instead uploads when picked, returning a `video_id` or `image_hash`. By
the time `Create` is pressed the wizard holds only IDs, and creation is a handful
of small POSTs. Per-file progress and thumbnails fall out of this for free.

**Uploads go through a Route Handler (`app/api/upload/route.ts`), not a Server
Action.** Next.js dispatches Server Actions one at a time per client, so
action-based uploads would serialise and block every other action while a video
encodes. Route Handlers have neither restriction. `bodySizeLimit: "512mb"` in
`next.config.ts` was raised for the old action-based upload and stays relevant only
as long as any action carries a file; the handler is not subject to it.

Video processing still polls, but per file and in the background while the rest of
the form is being filled.

### 4.2 Launch returns a receipt

`launch()` records every ID as it is created and returns them whether or not the
run succeeds:

```ts
type Receipt = {
  campaignId?: string;
  adSets: { id?: string; name: string; adIds: string[]; error?: string }[];
  failed: { adSetName: string; fileName: string; error: string }[];
};
```

A partial failure reports what exists and offers a retry that creates only the
missing ads against the existing ad set, instead of today's orphaned half-campaign
and lost form state.

### 4.3 Verification replaces SOP steps 14 and 16

After creation the app re-reads the campaign tree and asserts:

- every ad exists and is `ACTIVE`
- every ad's creative carries the intended `lead_gen_form_id`
- every ad set has the intended `custom_locations` radius and placements
- the campaign is `PAUSED`

Rendered as a pass/fail checklist. This is the part of the SOP currently done by
eye, and it is why the SOP has verification steps at all.

### 4.4 Wizard state

Client state, mirrored to `sessionStorage` under a single key. The repeater plus
five texts per ad set is too much typing to lose to a refresh, and uploaded video
IDs already live in the ad account, so restoring state costs nothing. No database.

The launch action takes a **typed object**, not `FormData`. Nested, repeating state
does not survive flattening into form fields — the age-slider bug fixed in
`7e63d01` was exactly that failure mode, where hidden inputs silently drifted from
the control driving them. `useActionState` accepts any action signature, so the
wizard passes its state object directly and the action validates it server-side.

### 4.5 Files

`lib/campaigns.ts` is 271 lines already covering reads, insights, uploads and
launching. Targeting, forms and `asset_feed_spec` would push it past the point
where it can be held in context at once, so it splits along its existing seams:

| File | Purpose |
|---|---|
| `lib/campaigns.ts` | reads, insights, status and budget writes *(trimmed)* |
| `lib/uploads.ts` | image and video upload, processing poll, thumbnail |
| `lib/forms.ts` | list a page's lead forms, build the Instant Forms deep link |
| `lib/targeting.ts` | geo, placements, special-category rules |
| `lib/launch.ts` | plan → execute → verify, returns `Receipt` |
| `app/api/upload/route.ts` | Route Handler receiving one file, returning its Meta id |
| `app/campaigns/new/wizard.tsx` | stepper shell and state |
| `app/campaigns/new/ad-set-block.tsx` | the repeating block |
| `app/campaigns/new/preview.tsx` | live preview |
| `app/campaigns/new/receipt.tsx` | verification checklist |

`lib/targeting.ts` and `lib/launch.ts` are pure enough to unit-test without hitting
Graph, matching the existing `lib/*.test.ts` pattern.

---

## 5. Prerequisites and open questions

### 5.1 Meta setup (resolved during design)

The system-user token originally lacked `pages_manage_ads`, so lead forms could be
neither read nor created — every page returned
`(#200) Requires pages_manage_ads permission`. The scope has since been added.

The remaining gap is asset assignment: `/me/accounts` returns 0 pages, so
page-scoped calls fail with `(#10) User has insufficient privileges on the page`.
`bun run assign` fixes this now that the scope is present, and must be re-run when
customers are added.

`leads_retrieval` is not offered for system users and is not needed here — it
governs pulling leads back out, which this feature does not do.

### 5.2 Payload shapes, confirmed against production

Both open questions were settled by reading the agency's own live campaigns
(162 lead ad sets across 18 ad accounts) rather than from documentation.

**The form and the five texts coexist.** `asset_feed_spec` and `object_story_spec`
are sent *together*: the feed spec carries only text, the story spec carries the
video and the form. `onsite_destinations` is not used at all, and
`ad_formats`, `call_to_action_types` and `link_urls` are absent from the feed spec.

```jsonc
{
  "object_story_spec": {
    "page_id": "1189746767562744",
    "instagram_user_id": "17841436659257779",
    "video_data": {
      "video_id": "1675767910156250",
      "image_hash": "fd3a65d637fd97be91ebbeab3fa371b8",   // thumbnail
      "call_to_action": {
        "type": "APPLY_NOW",
        "value": {
          "lead_gen_form_id": "2095967427699237",
          "link": "http://fb.me/"                          // placeholder for lead ads
        }
      }
    }
  },
  "asset_feed_spec": {
    "bodies":       [ /* 5 */ ],
    "titles":       [ /* 5 */ ],
    "descriptions": [ /* 1 */ ]
  }
}
```

This removes the "five texts *or* a lead form" risk entirely — no fallback needed.
Note `instagram_user_id`, not the retired `instagram_actor_id`.

**Placement enums, observed across 162 live ad sets:**

| Field | Values seen in production |
|---|---|
| `publisher_platforms` | `facebook`, `instagram`, `audience_network` |
| `facebook_positions` | `feed`, `story`, `facebook_reels`, `profile_feed`, `video_feeds`, `instream_video`, `marketplace`, `facebook_reels_overlay` |
| `instagram_positions` | `stream`, `story`, `reels`, `profile_feed`, `explore`, `explore_home`, `reels_overlay` |

"Feed and Stories only" is therefore `facebook_positions: ["feed", "story"]` and
`instagram_positions: ["stream", "story"]` — Instagram's feed is `stream`.

**Ad set shape confirmed:** `destination_type: "ON_AD"`,
`optimization_goal: "LEAD_GENERATION"`, `billing_event: "IMPRESSIONS"`,
`promoted_object: { page_id, smart_pse_enabled: false }`.

**Geo, as actually used:** `custom_locations` entries carry `address_string` plus
the coordinates Meta resolved from it, confirming server-side geocoding works.
92 of 162 ad sets use `custom_locations`; some combine them with `cities` entries.

### 5.3 Discrepancy worth raising

Observed radius is **25 km**, not the 17 km the SOP states, and several ad sets
target a `cities` entry alongside the custom location. The spec keeps 17 km as the
prefilled default because that is what the SOP says, but the field is editable and
the discrepancy should be confirmed with the SOP owner before build.

### 5.4 Coverage

Most entries in `customers.config.ts` have `adAccountIds: []`, so the creator is
usable for roughly 20 of ~200 customers until those are filled in. Out of scope
here; the customer picker states it rather than failing at launch.

---

## 6. Testing

| Unit | Covers |
|---|---|
| `lib/targeting.test.ts` | address + radius → `custom_locations`; placement enums; `EMPLOYMENT` suppresses age and gender |
| `lib/launch.test.ts` | plan order; `Receipt` shape on partial failure; retry creates only missing ads |
| `lib/forms.test.ts` | deep-link URL composition |
| `app/campaigns/new/name.test.ts` | name composition, date formatting, detach-on-edit |

Graph calls are stubbed. Against the live API, verification (§4.3) is the test: a
campaign is created and its tree read back.
