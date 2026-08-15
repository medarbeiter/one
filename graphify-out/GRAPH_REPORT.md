# Graph Report - medarbeiter_one  (2026-08-15)

## Corpus Check
- 120 files · ~121,557 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 786 nodes · 1581 edges · 46 communities (40 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Ad Set Editing
- Campaign Pages
- Asset Assignment
- Authentication and Loading
- Upload Queue
- Content Grid
- Meta Campaign Launch
- Media and Campaign Routes
- Location Reach
- TypeScript Configuration
- Copy Validation
- Launch Progress
- Media Dependencies
- Campaign Actions
- Campaign Verification
- Build Dependencies
- Deployment and Reconciliation
- Ad Format Architecture
- Geo Search
- Batch Launch Architecture
- Package Metadata
- Ad Creative Model
- Campaign Domain
- Launch Location Resolution
- Next App Design
- Campaign Prefill
- Campaign Stepper
- Package Scripts
- Brand Wordmark
- Brand Mark
- Ad Set Copy Model
- Customer Configuration
- Wizard Upload State
- Asset Pairing
- Navigation and Filtering
- Launch Receipt
- Video Transcoding
- HeroUI Dependency
- Next.js Dependency
- Next Configuration
- Icon Dependency
- PostCSS Configuration
- Page Concept

## God Nodes (most connected - your core abstractions)
1. `WizardSteps()` - 24 edges
2. `graph()` - 23 edges
3. `AdSetBlock()` - 20 edges
4. `listCustomers()` - 16 edges
5. `compilerOptions` - 16 edges
6. `locationProblem()` - 13 edges
7. `geoLocations` - 11 edges
8. `resolveLaunch()` - 10 edges
9. `LocationField()` - 9 edges
10. `run()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `LeadgenTosAlert()` --calls--> `leadgenTosUrl()`  [EXTRACTED]
  app/campaigns/new/wizard.tsx → lib/customers.ts
- `MedArbeiter One` --conceptually_related_to--> `Campaign`  [EXTRACTED]
  README.md → CONTEXT.md
- `Per-Ad Content Inference Without Modes` --rationale_for--> `Split Ad`  [EXTRACTED]
  docs/superpowers/specs/2026-08-13-ad-content-model-design.md → CONTEXT.md
- `GET()` --calls--> `authorizeUrl()`  [EXTRACTED]
  app/anmelden/route.ts → lib/hub.ts
- `POST()` --calls--> `launch()`  [EXTRACTED]
  app/api/launch/route.ts → lib/launch.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Ad Content Inference Flow** — docs_superpowers_specs_2026_08_13_ad_content_model_design_media_classification, docs_superpowers_specs_2026_08_13_ad_content_model_design_visible_pairing, docs_superpowers_specs_2026_08_13_ad_content_model_design_ugc_payload, docs_superpowers_specs_2026_08_13_ad_content_model_design_split_payload [EXTRACTED 1.00]
- **Faster Ad Creation Flow** — docs_superpowers_specs_2026_08_13_fast_campaign_creation_design_batch_path, docs_superpowers_specs_2026_08_13_fast_campaign_creation_design_pool_path, docs_superpowers_specs_2026_08_13_fast_campaign_creation_design_safe_fallback [EXTRACTED 1.00]
- **Portfolio Self-Healing Flow** — docs_superpowers_specs_2026_08_14_portfolio_abgleich_design_assignment_reconciliation, docs_superpowers_specs_2026_08_14_portfolio_abgleich_design_customer_derivation, docs_superpowers_specs_2026_08_14_portfolio_abgleich_design_customer_overrides, docs_superpowers_specs_2026_08_14_portfolio_abgleich_design_customer_doctor [EXTRACTED 1.00]

## Communities (46 total, 6 thin omitted)

### Community 0 - "Ad Set Editing"
Cohesion: 0.05
Nodes (68): listFormsAction(), pullFormAction(), AdSetBlock(), pairWarning(), HeadlineDialog(), buildRetryAdSets(), campaignUrl(), ReceiptPanel() (+60 more)

### Community 1 - "Campaign Pages"
Cohesion: 0.06
Nodes (56): NewCampaignPage(), Wizard(), CampaignsPage(), money(), PERIODS, CustomerPage(), CustomersPage(), initials() (+48 more)

### Community 2 - "Asset Assignment"
Cohesion: 0.05
Nodes (46): RootLayout(), AssignDeps, AssignedAsset, assigner, createAssigner(), ensureAssigned(), missingAssets(), PortfolioAsset (+38 more)

### Community 3 - "Authentication and Loading"
Cohesion: 0.07
Nodes (38): GET(), fehlerSeite(), GET(), metadata, Icon(), IconName, PATHS, NewCampaign() (+30 more)

### Community 4 - "Upload Queue"
Cohesion: 0.06
Nodes (44): arrived, Batch, batches, BatchToast(), changed(), count(), deposit(), drainArrived() (+36 more)

### Community 5 - "Content Grid"
Cohesion: 0.07
Nodes (35): AdTile(), AssetSlot, ContentGrid(), DRAG_TYPE, LooseTile(), percent(), phaseLabel(), previewUrl() (+27 more)

### Community 6 - "Meta Campaign Launch"
Cohesion: 0.08
Nodes (42): GraphError, adFormats(), AdJob, adParams(), AdSetInput, assetKey(), batchAds(), buildCreative() (+34 more)

### Community 7 - "Media and Campaign Routes"
Cohesion: 0.09
Nodes (29): GET(), IMAGE_TYPES, POST(), CampaignPage(), Metrics(), money(), Campaign, costPerResult() (+21 more)

### Community 8 - "Location Reach"
Cohesion: 0.16
Nodes (25): reachAction(), LocationField(), LocationValue, ReachLine(), ReachState, useDebounced(), useReach(), AddressLocation (+17 more)

### Community 9 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 10 - "Copy Validation"
Cohesion: 0.15
Nodes (16): checkCopy(), CopyField, CopyInput, CTA_WORDS, FEW_VARIANTS, filled(), hasDuplicate(), HEADLINE_EXTREME (+8 more)

### Community 11 - "Launch Progress"
Cohesion: 0.20
Nodes (10): POST(), LaunchState, refreshCampaignsAction(), useLaunch(), geoLocations, launchSteps(), LaunchEvent, ndjsonSink (+2 more)

### Community 12 - "Media Dependencies"
Cohesion: 0.12
Nodes (17): framer-motion, @internationalized/date, @mediabunny/aac-encoder, @mediabunny/prores, dependencies, framer-motion, @internationalized/date, mediabunny (+9 more)

### Community 13 - "Campaign Actions"
Cohesion: 0.20
Nodes (13): FormsResult, LaunchResult, setBudgetAction(), setStatusAction(), ad(), adSet(), submission, BudgetField() (+5 more)

### Community 14 - "Campaign Verification"
Cohesion: 0.19
Nodes (11): geoProblem(), checkCampaign(), formOf(), Intent, isSplit(), same(), splitProblem(), address (+3 more)

### Community 15 - "Build Dependencies"
Cohesion: 0.13
Nodes (15): devDependencies, tailwindcss, @tailwindcss/postcss, @types/bun, @types/node, @types/react, @types/react-dom, typescript (+7 more)

### Community 16 - "Deployment and Reconciliation"
Cohesion: 0.20
Nodes (10): App Container Service, Runtime Environment Configuration, Portfolio Reconciliation Implementation Plan, Two Pure Reconciliation Cores, Cached Assignment Reconciliation, Render-Triggered Portfolio Self-Reconciliation, Automatic Portfolio Asset Assignment, Coolify Docker Compose Deployment (+2 more)

### Community 17 - "Ad Format Architecture"
Cohesion: 0.24
Nodes (10): Format Asset, Portrait, Split Ad, Square, PLACEMENT Split-Ad Payload, Separate UGC and Split Payload Paths, Reels and Profile Feeds for Every Campaign, Omit placement_soft_opt_out (+2 more)

### Community 18 - "Geo Search"
Cohesion: 0.25
Nodes (8): searchPlacesAction(), GeoPlace, LOCATION_TYPES, RANK, Reach, searchPlaces(), toGeoPlace(), PLACEMENTS

### Community 19 - "Batch Launch Architecture"
Cohesion: 0.25
Nodes (9): Batch-or-Pool Ad Creation Architecture, Faster Campaign Creation Implementation Plan, Graph Fan-Out Batching, Progressive Error Isolation, Unified Inbox Item, Graph Batch Ad-Creation Path, Faster Campaign Creation, Bounded-Concurrency Pool Path (+1 more)

### Community 20 - "Package Metadata"
Cohesion: 0.28
Nodes (8): ignoreScripts, name, packageManager, private, trustedDependencies, version, sharp, unrs-resolver

### Community 21 - "Ad Creative Model"
Cohesion: 0.25
Nodes (8): Ad, Creative, Linked Ad, UGC Ad, Copy-on-Write Linked Ads, Per-Ad Content Inference Without Modes, UGC Creative Payload, Normalized File-Derived Ad Names

### Community 22 - "Campaign Domain"
Cohesion: 0.29
Nodes (8): Campaign, Client, MedArbeiter Domain Language, Interactive Campaign Creator Implementation Plan, Pure Builder and Receipt Architecture, Interactive Campaign Creator, SOP-Shaped Campaign Creation, Paused Campaign Creation

### Community 23 - "Launch Location Resolution"
Cohesion: 0.32
Nodes (7): duplicateLocations(), locationKey(), estimateReach(), Resolved, ResolveLaunchDeps, unresolvableLocation(), Check

### Community 24 - "Next App Design"
Cohesion: 0.33
Nodes (7): Next.js Agent Rules, AGENTS.md Instruction Reference, Meta Hub UX Rewrite Implementation Plan, URL-Driven Server Component Architecture, Meta Hub UX and Design Rewrite, Accessible MedArbeiter Visual System, MedArbeiter One

### Community 25 - "Campaign Prefill"
Cohesion: 0.48
Nodes (5): prefillAction(), defaultsFromAdSet(), lastCampaignDefaults(), newestAdSet(), Prefill

### Community 26 - "Campaign Stepper"
Cohesion: 0.40
Nodes (4): stateOf(), Stepper(), StepperStep, StepState

### Community 27 - "Package Scripts"
Cohesion: 0.33
Nodes (6): scripts, assign, build, customers, dev, start

### Community 28 - "Brand Wordmark"
Cohesion: 0.50
Nodes (5): Healthcare Identity, Heartbeat Pulse Line, MedArbeiter Logo, MedArbeiter Wordmark, Yellow Heart Emblem

### Community 29 - "Brand Mark"
Cohesion: 0.70
Nodes (5): Healthcare Brand Identity, Stylized Heart Symbol, Heartbeat Waveform, MedArbeiter Logo Mark, Yellow and Black Color Palette

### Community 30 - "Ad Set Copy Model"
Cohesion: 0.50
Nodes (5): Ad Set, Headline, Lead Form, Primary Text, Evidence-Calibrated Copy Checks

### Community 31 - "Customer Configuration"
Cohesion: 0.40
Nodes (5): Customer, Manual Customer Join Configuration, Live Portfolio Customer Derivation, Customer Configuration Doctor, Human Customer Overrides

### Community 32 - "Wizard Upload State"
Cohesion: 0.50
Nodes (4): Typed Session-Persisted Wizard State, Upload on File Pick, Browser-Side Meta Video Transcoding, Browser Video Preparation

### Community 34 - "Asset Pairing"
Cohesion: 0.67
Nodes (3): Pairing, Media Kind and Aspect-Ratio Classification, Visible Filename-Adjacency Pairing

### Community 35 - "Navigation and Filtering"
Cohesion: 0.67
Nodes (3): Function-First Navigation with Customer Scope, Today Operational Dashboard, URL-Backed Filtering

### Community 36 - "Launch Receipt"
Cohesion: 0.67
Nodes (3): Partial-Failure Launch Receipt, Post-Launch Verification Checklist, NDJSON Launch Progress Stream

### Community 37 - "Video Transcoding"
Cohesion: 0.67
Nodes (3): Codec-Driven Conversion Decision, Passthrough Remux Transcode Paths, Per-File Conversion and Upload Progress

## Knowledge Gaps
- **204 isolated node(s):** `IMAGE_TYPES`, `LaunchResult`, `FormsResult`, `DRAG_TYPE`, `RATIO` (+199 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `graph()` connect `Asset Assignment` to `Campaign Pages`, `Meta Campaign Launch`, `Media and Campaign Routes`, `Launch Progress`, `Campaign Actions`, `Campaign Verification`, `Geo Search`, `Campaign Prefill`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `listCustomers()` connect `Campaign Pages` to `Asset Assignment`, `Authentication and Loading`, `Launch Location Resolution`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `sessionSecret()` connect `Authentication and Loading` to `Asset Assignment`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `IMAGE_TYPES`, `LaunchResult`, `FormsResult` to the rest of the system?**
  _204 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Ad Set Editing` be split into smaller, more focused modules?**
  _Cohesion score 0.05054945054945055 - nodes in this community are weakly interconnected._
- **Should `Campaign Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.05502392344497608 - nodes in this community are weakly interconnected._
- **Should `Asset Assignment` be split into smaller, more focused modules?**
  _Cohesion score 0.05076679005817028 - nodes in this community are weakly interconnected._