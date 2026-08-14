---
status: accepted
---

# Reels and profile feeds are added to every campaign

`lib/targeting.ts` sent `facebook_positions: ["feed", "story"]` and
`instagram_positions: ["stream", "story"]`, following the SOP's "Feed and Stories
only". That leaves the Portrait half of a Split Ad nowhere to show, since the
portrait bucket in every live customised creative is `story` + `facebook_reels` /
`story` + `reels`. We now send Reels and profile feeds on **all** campaigns,
including UGC-only ones, which the SOP owner confirmed matches intent — one UGC
video is meant to run in Stories, Reels and Feed alike.

## Consequences

This changes what already-working campaign shapes buy, and it moves real money:
placements apply to every ad in an ad set, so every plain UGC campaign starts
bidding on Reels and profile-feed inventory. It ships as its own commit, separate
from Split Ads, so a shift in delivery can be attributed to it.

We deliberately do **not** send `placement_soft_opt_out` ("Allow limited spending
on excluded placements"). Meta's 2025-10-08 announcement states that API-created
ad sets are not defaulted into limited spend — the checkbox is on by default in
Ads Manager and off by default via the API — so sending nothing is what disables
it. Because that rests on a blog post rather than on anything observable in our own
data (0 of 251 live ad sets carry the field), the verification checklist asserts
the field is absent or empty on every launch instead of trusting it.
