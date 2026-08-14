---
status: accepted
---

# Split Ads get their own payload path

`README.md` and the 2026-08-12 campaign-creator spec both recorded multi-format
creatives as deliberately out of scope. We are reversing that, because the agency
already builds them by hand — 116 live creatives across 27 ad accounts use
`asset_customization_rules` — and the app could not express the shape at all. A
Split Ad (one 9:16 asset, one 1:1 asset) needs `optimization_type: "PLACEMENT"`,
with the media *and the lead form* inside `asset_feed_spec` and `object_story_spec`
reduced to page and Instagram identity: a different payload from the UGC path, not
a variation on it.

## Considered options

A UGC Ad is expressible as a Split Ad with a single catch-all rule, so **one**
`PLACEMENT` path could have replaced both and left us with one code path, one
mental model, one set of tests. We kept two paths anyway. The UGC path is ~100% of
current volume and works; the comment at `lib/launch.ts:47` records that Meta
already rejected one wrong `asset_feed_spec` shape ("Ein Asset Feed kann nur ein
bestimmtes Format haben"), so rewriting the working majority case to serve the new
minority case trades a real risk for an aesthetic gain. The branch is ~15 lines.

## Consequences

Two shapes must be kept working, and `lib/verify.ts` has to look for the lead form
in both specs — it currently only reads `object_story_spec`, which would report
every Split Ad as having the wrong form. If the `PLACEMENT` path proves itself in
production, collapsing to one path stays available.
