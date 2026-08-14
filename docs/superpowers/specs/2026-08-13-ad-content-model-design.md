# MedArbeiter One — Ad Content Model (UGC and Split Ads)

**Date:** 2026-08-13
**Status:** Approved, ready for implementation planning
**Scope:** Replace the video-only ad model in `app/campaigns/new/ad-set-block.tsx`
and `lib/launch.ts` with one that also produces placement-customised ads

---

## 1. Purpose

The agency runs three content shapes:

1. **UGC only** — one video per ad, shown in every placement unreshaped. Most common.
2. **Creatives** — two files per ad, one 9:16 and one 1:1, so Stories/Reels and Feed
   each get media already in their shape.
3. **Both in one Ad Set.**

The third case is the important one: it proves these are not three *modes*. If a
single Ad Set can hold both, the distinction lives per **Ad**, and asking the user
to declare a campaign type up front would be asking a question the data already
answers. **This spec therefore adds no mode selector anywhere.** The user drops
files; the app decides what each one is.

Today the app cannot express case 2 at all — `ad-set-block.tsx:239` throws
`"only videos are used for ads."` for any non-video, and `buildCreative()` emits
exactly one `video_id`.

### Terminology

Defined in [`CONTEXT.md`](../../../CONTEXT.md). The load-bearing ones: an **Ad** is
either a **UGC Ad** (one video) or a **Split Ad** (one **Portrait** 9:16 asset plus
one **Square** 1:1 asset). "Creative" means Meta's `adcreative` object and nothing
else — it never appears in the UI.

---

## 2. Decisions

| Question | Decision |
|---|---|
| Mode selector for the three content shapes? | **None.** Inferred per Ad from the dropped files |
| What makes an Ad a UGC Ad? | **It is a video.** Videos are never auto-paired |
| What makes an Ad a Split Ad? | **It is images.** A photo is never UGC |
| Pairing signal | **Filename adjacency**, then manual drag. Never silent |
| Cropping | **Never.** Both halves upload as delivered |
| Placement buckets | **Two.** Portrait = Stories + Reels; Square = catch-all |
| Payload | **Two paths.** UGC keeps today's exact payload; Split uses `PLACEMENT` |
| Texts | **Unchanged** — per Ad Set, shared by every Ad in it |
| Mixed-kind pairs | Allowed, behind an ignorable warning |
| Ad naming | Splits are `Creative N` per Ad Set; UGC keeps its filename. Both editable |
| Asset reuse across Ad Sets | **Linked**, not copied. Editing a borrowed Ad detaches it |
| New placements | Add Reels and profile feeds to **all** campaigns |
| Limited spend on excluded placements | Already off via API — send nothing, assert it |

---

## 3. Classification

Every dropped file is classified at pick time, before upload, from its media kind
and aspect ratio. Videos are probed by mediabunny (`getCodedWidth`/`getCodedHeight`,
already called in `lib/transcode.ts`); images by `createImageBitmap`. Neither costs
an upload.

| File | Class | Default |
|---|---|---|
| Video | — | **UGC Ad**, always |
| Image, `w/h < 0.7` | Portrait | Half of a Split Ad |
| Image, `w/h ≥ 0.7` | Square | Half of a Split Ad |

The threshold is 0.7 because 9:16 is 0.5625 and Meta's other recommended Feed
ratio, 4:5, is 0.8 — so 4:5, 1:1 and 16:9 all land on the Square side, where they
belong. It is a constant, not a setting.

An image that ends up unpaired is an **error state**, not a silently published
one-format ad: the Ad Set cannot be submitted until it is paired or removed. Your
account contains no live single-image lead ad, so publishing one would be inventing
a shape the agency does not use.

## 4. Pairing

Images arrive from one bulk folder with names like `Creative 3` and `Creative 4`,
where **3 and 4 are the two halves of one Ad** — adjacent numbering, not a shared
stem. Names "may differ extremely", so this is a hint, never a rule.

1. **Filename adjacency.** Natural-sort the unpaired images; pair a Portrait with a
   Square whose trailing integer differs by one. Only when unambiguous.
2. **Manual drag.** Everything else stays unpaired for the user to drag together.

**Nothing is ever paired silently.** Each proposed pair renders as a two-tile card
stating why it was proposed ("adjacent names: Creative 3, Creative 4"), so a wrong
guess is visible at a glance and costs one drag to fix. Dragging two videos together
is allowed — it makes a Split Ad — as is a mixed image+video pair, behind a warning
the user can dismiss.

> Video durations are an exact pairing signal — every live Split has identical
> lengths on both halves, to the millisecond. It goes unused because videos default
> to UGC. Worth remembering if that default is ever revisited.

## 5. Interface

The Ad Set block's file input becomes one drop zone for that Ad Set, and the flat
thumbnail list becomes a list of **Ad cards**:

- **UGC Ad** — one tile, the video thumbnail, its filename as the name.
- **Split Ad** — two tiles side by side, labelled `Portrait · Story, Reels` and
  `Square · Feed`, named `Creative N`.
- **Unpaired image** — one tile in an error state, draggable onto another.

The card layout mirrors Meta's own *Hochformat / Quadratisch* pair, so it needs no
learning. `preview.tsx` gains the same two-tile treatment for Splits, sharing the
single text cycler below.

Uploads are **per Ad Set**, as today. A `Use content from…` control lists Ads
already built in other Ad Sets of this campaign and links them in (§6) — no second
upload, no second transcode.

## 6. Linking across Ad Sets

Meta has no cross-Ad-Set ad: every ad belongs to exactly one ad set, and the
creative cannot be shared either because the lead form sits *inside* it and is
chosen per Ad Set. **Linking is therefore a wizard-state concept only.** At launch
each Ad Set gets its own creative and its own ad, exactly as if nothing were linked.
Linking saves uploads and typing, never API objects.

- **What travels:** Format Assets, their pairing, and the Ad's name. Form, texts,
  address and radius always come from the Ad Set the Ad sits in. So `Creative 1` at
  two Locations is the same footage, two towns, possibly two different lead forms.
- **Propagation:** edits at the source reach every borrower. Editing a *borrowed*
  Ad — including renaming it — detaches that one Ad only, copy-on-write, and the
  card stops showing "linked from Location 1".
- **Naming:** a borrowed Ad keeps its source name; locally created Ads number around
  what is taken. This keeps "Creative 1 means the same thing everywhere" true.
- **Deleting the source** Ad Set detaches borrowers rather than deleting their Ads;
  the assets already live in the ad account. Removing an Ad at the source warns
  first, naming the Locations that borrow it.

## 7. Payloads

Two paths. The UGC path is byte-for-byte what `buildCreative()` sends today and
must not change — it is the 100% case and it works.

### 7.1 UGC Ad — unchanged in shape

`object_story_spec.video_data` carries video, thumbnail and form;
`asset_feed_spec` carries text only, with `optimization_type: "DEGREES_OF_FREEDOM"`.

Two corrections were forced by validating the real payload (§13), both of which
affected the UGC path *before* this feature existed:

- **`standard_enhancements` is deprecated** and Meta now rejects any creative
  carrying it. It is replaced by the itemised opt-outs (`advantage_plus_creative`,
  `image_enhancement`, `image_templates`, `image_touchups`, `inline_comment`,
  `text_optimizations`), which express the same intent: Meta changes nothing.
- **`DEGREES_OF_FREEDOM` requires at least one text field with more than one
  entry.** One primary text plus one headline is rejected. `buildCreative()` now
  throws a readable error, the ad-set block warns inline, and the Create button is
  disabled until it is resolved. Split Ads (`PLACEMENT`) are unaffected.

### 7.2 Split Ad — `PLACEMENT`

Copied from the agency's own live creatives, not from documentation.

```jsonc
{
  "object_story_spec": { "page_id": "…", "instagram_user_id": "…" },  // no media
  "asset_feed_spec": {
    "images": [                                        // or "videos"
      { "hash": "…", "adlabels": [{ "name": "<L_portrait>" }] },
      { "hash": "…", "adlabels": [{ "name": "<L_square>" }] }
    ],
    "bodies":       [ { "text": "…", "adlabels": [{ "name": "<L_body_p>" }, { "name": "<L_body_s>" }] } ],
    "titles":       [ { "text": "…", "adlabels": [{ "name": "<L_title_p>" }, { "name": "<L_title_s>" }] } ],
    "descriptions": [ { "text": "…" } ],               // unlabelled — shared
    "call_to_action_types": ["APPLY_NOW"],
    "call_to_actions": [{ "type": "APPLY_NOW", "value": { "lead_gen_form_id": "…" } }],
    "link_urls": [{ "website_url": "http://fb.me/", "display_url": "",
                    "adlabels": [{ "name": "<L_url_p>" }, { "name": "<L_url_s>" }] }],
    "ad_formats": ["SINGLE_IMAGE"],                    // SINGLE_VIDEO / AUTOMATIC_FORMAT
    "optimization_type": "PLACEMENT",
    "asset_customization_rules": [
      { "priority": 1,
        "customization_spec": { "age_min": 18, "age_max": 65,
          "publisher_platforms": ["facebook", "instagram"],
          "facebook_positions": ["story", "facebook_reels"],
          "instagram_positions": ["story", "reels"] },
        "image_label": { "name": "<L_portrait>" },
        "body_label":  { "name": "<L_body_p>" },
        "title_label": { "name": "<L_title_p>" },
        "link_url_label": { "name": "<L_url_p>" } },
      { "priority": 2,
        "customization_spec": { "age_min": 18, "age_max": 65 },   // catch-all
        "image_label": { "name": "<L_square>" },
        "body_label":  { "name": "<L_body_s>" },
        "title_label": { "name": "<L_title_s>" },
        "link_url_label": { "name": "<L_url_s>" } }
    ]
  }
}
```

Notes that are easy to get wrong:

- **The Square rule is the bare catch-all**, carrying no placement keys. Two rules
  then cover every placement by construction, so no placement can end up with no
  asset. This is the majority live shape (158 bare specs).
- **Assets bind to rules by adlabel, never by array position.** Rule order is not
  stable — of 13 live Splits sampled, 7 list the Portrait rule first and 6 the
  Square rule first. `priority` expresses precedence.
- **Every rule carries `body_label` and `title_label`**, and each text carries the
  labels of *both* rules. That is how "the same five texts for both formats" is
  expressed. `descriptions` is unlabelled and shared.
- **`image_crops` is never sent.** Both halves upload as delivered.
- `ad_formats` is `SINGLE_IMAGE` for two images, `SINGLE_VIDEO` for two videos, and
  `AUTOMATIC_FORMAT` for a mixed pair, matching the three live mixed examples.
- Labels are created per creative; names are arbitrary but must be unique.

## 8. Placements

`PLACEMENTS` in `lib/targeting.ts` gains Reels and profile feeds, for **every**
campaign this app creates, UGC-only ones included:

```ts
publisher_platforms: ["facebook", "instagram"],
facebook_positions:  ["feed", "story", "facebook_reels", "profile_feed"],
instagram_positions: ["stream", "story", "reels", "profile_feed"],
```

Without Reels the Portrait half of a Split Ad would have nowhere to show. This
changes what existing campaign shapes buy, so it ships as its own commit — see
[ADR-0002](../../adr/0002-reels-and-profile-feed-placements.md).

**`placement_soft_opt_out` ("Allow limited spending on excluded placements") is not
sent.** Meta's announcement is explicit that API-created ad sets are not defaulted
into limited spend — the checkbox is on by default in Ads Manager and off by default
via the API. Sending nothing is the correct implementation; §10 asserts it rather
than trusting it.

## 9. Launch, receipt and retry

`AdSetInput.videos` becomes `ads`:

```ts
type FormatAsset =
  | { kind: "video"; videoId: string; thumbnailUrl?: string; fileName: string }
  | { kind: "image"; hash: string; url?: string; fileName: string };

type AdInput =
  | { name: string; type: "ugc";   asset: FormatAsset }
  | { name: string; type: "split"; portrait: FormatAsset; square: FormatAsset };
```

`launch()` branches on `type` when building the creative and is otherwise unchanged
— same order, same paused campaign, same active ad sets.

`Receipt.failed` is re-keyed from `fileName` to the **ad name**. A Split has two
files and one ad; the upload already succeeded by then, so "which file failed" was
always the wrong question. Retry rebuilds by ad, which is what it does in practice
today — the field name was lying about it.

## 10. Verification

`lib/verify.ts` has a latent guaranteed failure: `formOf()` reads the form from
`object_story_spec.video_data.call_to_action`, and `VERIFY_FIELDS` never requests
`asset_feed_spec`. For a Split Ad the form is in `asset_feed_spec.call_to_actions`,
so the check would return `undefined` and report **every Split Ad as having the
wrong lead form**.

- `formOf()` looks in both specs; `VERIFY_FIELDS` requests `asset_feed_spec`.
- Per Split Ad: exactly two `asset_customization_rules`; one naming `story` +
  `facebook_reels` / `story` + `reels`, one bare; every rule label resolving to an
  asset actually present; `ad_formats` matching the media kind.
- Per Ad Set: `placement_soft_opt_out` absent or empty. This turns "the API default
  is off" from something read in a blog post into something the receipt proves on
  every launch.
- The "Placements limited to feed and stories" check is relabelled for §8.

## 11. Files

| File | Change |
|---|---|
| `lib/targeting.ts` | Reels + profile feeds; the two rule specs |
| `lib/launch.ts` | `AdInput`; `buildCreative` branches UGC / Split |
| `lib/verify.ts` | form lookup in both specs; Split assertions |
| `lib/uploads.ts` | unchanged — `uploadImage()` already works |
| `lib/media.ts` *(new)* | classification and pairing, pure, unit-testable |
| `app/api/upload/route.ts` | accept JPEG and PNG alongside video |
| `app/campaigns/new/ad-set-block.tsx` | drop zone, Ad cards, drag pairing, linking |
| `app/campaigns/new/state.ts` | `ads` replaces `videos`; bump the draft key to v3 |
| `app/campaigns/new/preview.tsx` | two tiles for a Split |
| `app/campaigns/new/receipt.tsx` | failures by ad name |

The `sessionStorage` key moves to `v3`: a v2 draft's `videos` array cannot be mapped
onto `ads` without inventing pairings, so old drafts are dropped, exactly as the v1→v2
comment in `state.ts` reasons.

## 12. Testing

| Unit | Covers |
|---|---|
| `lib/media.test.ts` | classification at the 0.7 boundary (9:16, 4:5, 1:1, 16:9); adjacency pairing; ambiguity left unpaired |
| `lib/launch.test.ts` | Split creative shape; labels bind assets to the right rule; catch-all Square rule; `ad_formats` per kind |
| `lib/targeting.test.ts` | Reels and profile feeds present; no `placement_soft_opt_out` |
| `lib/verify.test.ts` | form found in either spec; Split with a dangling label fails |

## 13. Evidence

Every payload claim here was read from the agency's own live campaigns across 27 ad
accounts, not from documentation.

- **116 creatives already use `asset_customization_rules`** — the agency does this
  by hand today. Dominant shapes: 98 × two image rules, 26 × two video rules,
  25 × three video rules.
- **Pairs are 9:16 + 1:1**, confirmed by measurement (1080x1920 + 1080x1080,
  2160x3840 + 2880x2880, 1152x2048 + 2048x2048). One outlier is 16:9 + 9:16.
- **Both halves of a video Split share an identical duration** to the millisecond.
- **Rule keys:** `body_label + title_label + link_url_label + priority` plus
  `image_label` (167) or `video_label` (55); 32 rules omit `link_url_label`.
- **97 of 116** customised creatives carry the lead form inside `asset_feed_spec`;
  none carries media in `object_story_spec`.
- `image_crops` exists and is used by the one-file-two-crops workflow the agency
  does not use.
- **0 of 251** live ad sets carry any placement-relaxation field.

Payload shapes were then confirmed by **writing** to the API with
`execution_options: ["validate_only"]`, which validates without creating anything.
This is what caught the two live bugs above, and it distinguishes read values from
write values — `customization_spec` comes *back* carrying `age_min`/`age_max`
because Meta fills them in, but sending them is neither needed nor allowed under
`EMPLOYMENT`. The bare catch-all Square rule was verified to be accepted this way.
`buildCreative()`'s real output validates for all four cases: UGC, two-video Split,
two-image Split, and mixed Split.

## 14. Out of scope

Per-Ad text overrides · Meta's crop editor · three or more placement buckets ·
carousels · sharing one creative across Ad Sets · carrying format structure forward
in prefill.

## 15. Texts

Nothing is ever prefilled into **Primary texts, Headlines or Description** — each
ad set starts with one empty primary text, one empty headline and an empty
description. Prefill from the client's last campaign carries **the address and
radius only**; `lastCampaignDefaults()` no longer reads the previous creative at
all. Texts are rewritten every campaign, and a stale line left over from the last
job ad is worse than a blank field: a blank field is visible, a wrong one is not.

**Description is multi-line, up to 1500 characters.** It holds the benefits list
with line breaks (`✔ 30 Tage Urlaub …`), not a one-line strapline, so it renders
as a `TextArea` rather than an `Input`. 1500 was verified against the API with
`validate_only` on both the UGC and Split paths; Meta accepted 2000 as well, so
the limit is ours, not Meta's.

This interacts with §7.1: a UGC ad needs a second primary text or a second
headline, and since nothing is prefilled, every new ad set starts in that state.
The ad-set block warns inline and the Create button stays disabled until it is
resolved — deliberately, because the alternative is Meta rejecting the launch
half-way through with an untranslated error.

### 15.1 Copy checks

`lib/copy.ts` renders inline notices under each text field. **Nothing here ever
blocks a launch** — they are `warn` (something is measurably wrong) or `info`
(this departs from house style). Every threshold is derived from 1149 live
creatives, and the rules were then run back over those same creatives to measure
the false-alarm rate: **75% produce no notice at all, median 0.** A rule that
fires on your own successful ads is noise, so that number is the acceptance test.

| Check | Level | Fires on live ads |
|---|---|---|
| Two primary texts / headlines identical | warn | 0% |
| Empty field between filled ones — Meta accepts it and rotates nothing there | warn | 0% |
| No primary text names the client (90% of live ads do) | info | 10% |
| A primary text far below the live floor of 178 characters | info | 9% |
| Fewer than 3 primary texts / headlines (live median is 5) | info | 7% / 6% |
| No description | info | 3% |
| A headline over 60 characters — cut off everywhere | info | 3% |
| No primary text asks the reader to apply (98% of live ads do) | info | 1% |
| *Every* headline over 40 — none survives truncation | info | 1% |

Two rules were **rejected by measurement** rather than shipped:

- **"The client name is missing from the headline."** Only 13% of live ads name
  the client in a headline versus 90% in the body, so the check belongs on the
  body alone. As written for headlines it would have contradicted 87% of the
  agency's own ads.
- **"The city is not mentioned."** Just 1% of live ad sets name their city in the
  copy, so this would have fired on 99% of them.

And one was corrected: "a headline is over 40 characters" fired on **49%** of live
ads, because the 40 came from the p90 of *individual* headlines while a creative
carries five. The meaningful signal is that *no* headline is short enough, which
happens 1% of the time.

Generic words are stripped from the client name before matching
(`Pflegedienst`, `GmbH`, `Ambulante`, …), so "Pflegedienst" appearing in the body
does not count as naming *Pflegedienst Herzhalt*. When a name reduces to nothing
but generic words, the rule switches itself off rather than nagging.

## 16. Naming, budget and progress

Three things that only showed up once a real campaign had been created.

### 16.1 Ad names

Ads were named `${campaignName} – ${fileName}`, which in Ads Manager reads as

> VitalCura GmbH Hennef - FK,HK,LG1/LG2,MFA ab 13.08.2026 KF (via One) – Elisabeth 5.MOV

Sixty characters of campaign name, repeated on every row of the campaign it is
already filed under, in front of the only part that distinguishes one ad from
another — and then a file extension that means nothing to anyone reading the
list.

An ad is now named after its content and nothing else: the file name without its
extension for a UGC Ad, `Creative N` for a Split Ad. The same name goes on the
`adcreative`. `stripExtension()` takes the extension off; `uniqueName()` keeps
`Laura 1.mov` and `Laura 1.mp4` apart afterwards, since both would otherwise
land on `Laura 1` and become indistinguishable in reporting.

The *campaign* name is untouched — it is the one place the long form belongs.

### 16.2 Daily budget in cents

`NumberField` had `step={1}`, and react-aria snaps the value to the step on
blur: typing `30,05` silently produced `30,00`. Now `step={0.01}` with two
fixed fraction digits, in the wizard and in the campaigns table's inline editor,
which had the same bug. `Math.round(euros * 100)` was already correct.

### 16.3 Progress while creating

A campaign with three ad sets of five ads each is over thirty sequential calls
against Meta. Behind a Server Action that is a single response at the very end —
one static "Creating…" for a minute, with nothing to tell a slow run from a
hung one. That is the state in which somebody clicks Create a second time.

`launch()` now takes an `onProgress` callback and names each call before it
makes it, against a denominator (`launchSteps()`) fixed before the first one, so
the count never shifts under the reader. A failed ad — and a whole failed ad set
— still counts as done, or the bar would stick while the run carried on.

The work moved from a Server Action to `app/api/launch`, a Route Handler
streaming NDJSON, because an action cannot answer twice. Two consequences worth
recording:

- `updateTag()` exists only in Server Actions, so the client calls
  `refreshCampaignsAction()` once a campaign id comes back. Without it the new
  campaign is missing from the table for up to 60 seconds.
- A dropped connection no longer means nothing was created. The error says so,
  and says to check the table before creating again.

`lib/ndjson.ts` holds the queue-to-stream plumbing so it can be tested rather
than assumed — including that a line is readable the moment it is pushed, and
that a multi-byte character split across a chunk boundary survives. Verified
end-to-end against `next start`: three events pushed 700 ms apart arrived
700 ms apart.

While auditing the rest of the flow for the same problem: `/campaigns` and
`/campaigns/new` gained `loading.tsx` (both block on Graph calls before
rendering anything), and the prefill now says that it is reading the last
campaign and that it has changed the location — previously those fields simply
rewrote themselves while the user was looking at them. Uploads and lead-form
loading already reported themselves and were left alone.

`app/campaigns/new/stepper.tsx` was deleted: an abandoned earlier version of the
wizard, imported by nothing, and already failing `bun run build` before any of
this work. It was the last caller of the Server Action that the Route Handler
replaces.
