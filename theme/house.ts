/**
 * MedArbeiter House Theme
 *
 * The Astryx theme built from the house palette (`@/lib/palette`): brand
 * gold as the accent on a white/warm-paper ground, warm stone neutrals,
 * Poppins headings (wordmark kinship), Figtree body text for long-form
 * legibility, and warnings shifted to orange so status never impersonates
 * the brand colour. Light mode only — this theme does not ship a
 * toggleable dark skin. The categorical OKLCH palette below is inherited
 * unchanged from Astryx Neutral.
 *
 * Neutral notes (inherited): a pure grayscale spine with a from-scratch
 * OKLCH-derived categorical palette. Hues sit at evenly-spaced positions on
 * the OKLCH wheel, chosen to keep each colour recognizable at every tone
 * (no red drift for orange, no blue drift for purple) and well-separated
 * from its neighbours.
 *
 * Core neutral palette: #fafafa, #f5f5f5, #e5e5e5, #737373, #262626, #0a0a0a
 *
 * Categorical hues (OKLCH; chroma = max-in-gamut at the saturated stop):
 *   Red H=25    Orange H=65    Yellow H=90    Green H=145
 *   Teal H=180  Cyan H=215     Blue H=250     Purple H=320  Pink H=355
 *
 * Saturated badge stops:
 *   • Cool/medium hues sit at OKLCH L=0.48–0.50 with white text (AA+)
 *   • Bright warm hues (orange L=0.68, yellow L=0.80) use dark text
 *
 * Token tonal stops:
 *   bg     = T90
 *   border = T80
 *   icon   = T30
 *   text   = T30
 *
 * All 9 saturated badge values pass WCAG AA (5.6–9.6 contrast range).
 *
 * Only overrides tokens that differ from the Astryx defaults.
 */

import { defineTheme, defineSyntaxTheme } from "@astryxdesign/core/theme";
import { PALETTE } from "@/lib/palette";

/**
 * Neutral syntax palette — pulled from the OKLCH T30 stops of the
 * categorical ramps. Same colours used by the --color-icon-* tokens.
 */
const neutralSyntax = defineSyntaxTheme({
  name: "xds-neutral",
  tokens: {
    keyword: "#700084", // purple T30
    string: "#005600", // green T30 (saturated)
    comment: "#737373", // neutral
    number: PALETTE.warningText, // orange T30
    function: "#00458c", // blue T30 H=255
    type: "#700084", // purple
    variable: PALETTE.warningInk, // near-black
    operator: "#737373", // neutral
    constant: PALETTE.warningText, // orange
    tag: "#89001a", // red
    attribute: "#584400", // yellow
    property: "#005348", // teal
    punctuation: "#a3a3a3", // neutral
    background: "#fafafa",
  },
});

export const houseTheme = defineTheme({
  name: "house",

  // Typography: Poppins headings echo the MedArbeiter wordmark and
  // marketing site; Figtree body for long-form legibility at data density.
  // Scale: base=14, ratio=1.2. Bold weights on h3/h4 for subsection hierarchy.
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: {
      family: "var(--font-figtree)",
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: "var(--font-poppins)",
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      weights: { 3: "bold", 4: "bold" },
    },
    code: {
      family: "ui-monospace",
      fallbacks:
        '"SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
  },

  // Motion: snappier than default, matching shadcn/Tailwind conventions.
  // Produces: fast-min=95ms, fast=125ms, fast-max=165ms,
  //           medium-min=225ms, medium=300ms, medium-max=400ms.
  motion: { fast: 125, medium: 300, slow: 700, ratio: 0.75 },

  syntax: neutralSyntax,

  tokens: {
    // =========================================================================
    // Backgrounds — Figma-style flat with a single lifted surface. White
    // surfaces float on a barely-warm paper body — the brand's white ground
    // with the marketing site's warm cast, not a gray ladder.
    // =========================================================================
    "--color-background-surface": PALETTE.white,
    "--color-background-body": PALETTE.paper,
    "--color-background-card": PALETTE.white,
    "--color-background-popover": PALETTE.white,
    "--color-background-muted": PALETTE.parchment,
    // The inverted surface — the attention notification is its only
    // consumer. Astryx's default is a cool blue-black (#0A1317); in a
    // house built from warm paper that would be the only cold tone in it.
    // So this theme's own ink instead (see `onDark` below for what sits on
    // top of it).
    "--color-background-inverted": PALETTE.ink,

    // Accent + neutral surface tints (sit alongside backgrounds)
    // Brand gold carries the accent; the muted stop is its pastel wash.
    "--color-accent": PALETTE.gold,
    "--color-accent-muted": PALETTE.goldWash,
    "--color-neutral": "#0000000F",

    // Overlays (modal scrims, hover/pressed tints)
    "--color-overlay": "#00000080",
    "--color-overlay-hover": "#0000000D",
    "--color-overlay-pressed": "#0000001A",

    // Text
    "--color-text-primary": PALETTE.ink,
    "--color-text-secondary": PALETTE.stone,
    "--color-text-disabled": PALETTE.stoneDisabled,
    // Text-grade gold is bronze: clears 6:1 on white (see contrast.test.ts).
    "--color-text-accent": PALETTE.bronzeText,
    "--color-on-dark": PALETTE.white,
    "--color-on-light": PALETTE.warningInk,
    // Gold is bright: dark ink sits on it, not white (white on gold fails
    // AA — see lib/contrast.test.ts).
    "--color-on-accent": PALETTE.onGold,
    "--color-on-success": PALETTE.white,
    "--color-on-error": PALETTE.white,
    "--color-on-warning": PALETTE.warningInk,

    // Icon
    "--color-icon-accent": PALETTE.goldIcon,
    "--color-icon-primary": PALETTE.warningInk,
    "--color-icon-secondary": "#737373",
    "--color-icon-disabled": "#a3a3a3",

    // Status / Sentiment — pastel bg + dark colored text/icon (T30/T40 stop).
    "--color-success": "#007004",
    "--color-error": PALETTE.errorText,
    // Warning sits in the orange family, not yellow — a yellow warning
    // would collide with the brand gold that paints primary actions.
    "--color-warning": PALETTE.warningText,
    "--color-success-muted": "#c5e5c0",
    "--color-error-muted": "#facecb",
    "--color-warning-muted": "#fad0b5",

    // Border
    "--color-border": `${PALETTE.ink}14`,
    "--color-border-emphasized": PALETTE.borderEmphasized,

    // Effects
    // A placeholder carries this house's paper, not Astryx's cool grey
    // #ebebeb.
    //
    // A placeholder carries no meaning, so it must not look like work. Full
    // gold (--color-accent-muted) would have claimed exactly that — a
    // screen full of gold bars says "work has happened here" before
    // anything has loaded. So only a hint of it: #ece2c9 sits at 1.21:1 on
    // the paper ground #faf8f3, the same loudness as Astryx's own #ebebeb
    // (1.24:1) — same volume, different temperature. A placeholder carries
    // no meaning (aria-hidden), so it does not fall under the 3:1 floor.
    "--color-skeleton": "#ece2c9",
    "--color-shadow": "#0000001A",
    "--color-tint-hover": "black",

    // =========================================================================
    // Categorical — pastel surface + dark colored text/icon. Inherited from
    // Astryx Neutral unchanged; not part of the house brand palette.
    // =========================================================================
    "--color-background-red": "#facecb",
    "--color-border-red": "#e6bab8",
    "--color-icon-red": "#89001a",
    "--color-text-red": "#89001a",

    "--color-background-orange": "#fad0b5",
    "--color-border-orange": "#e6bda2",
    "--color-icon-orange": PALETTE.warningText,
    "--color-text-orange": PALETTE.warningText,

    "--color-background-yellow": "#f8da9d",
    "--color-border-yellow": "#e4c279",
    "--color-icon-yellow": "#584400",
    "--color-text-yellow": "#584400",

    "--color-background-green": "#c5e5c0",
    "--color-border-green": "#b2d1ac",
    "--color-icon-green": "#0c5700",
    "--color-text-green": "#0c5700",

    "--color-background-teal": "#a5e3d6",
    "--color-border-teal": "#94d6c8",
    "--color-icon-teal": "#005348",
    "--color-text-teal": "#005348",

    "--color-background-cyan": "#a3e0ef",
    "--color-border-cyan": "#91d3e3",
    "--color-icon-cyan": "#00505f",
    "--color-text-cyan": "#00505f",

    "--color-background-blue": "#c4ddfb",
    "--color-border-blue": "#b1c9e7",
    "--color-icon-blue": "#00458c",
    "--color-text-blue": "#00458c",

    "--color-background-purple": "#eccef3",
    "--color-border-purple": "#d8bbdf",
    "--color-icon-purple": "#700084",
    "--color-text-purple": "#700084",

    "--color-background-pink": "#fccadc",
    "--color-border-pink": "#e7b7c8",
    "--color-icon-pink": "#83004b",
    "--color-text-pink": "#83004b",

    // Gray (categorical neutral, chroma 0) — #e5e5e5, so it stays visibly
    // distinct from the lighter body/muted surface (both #f5f5f5).
    "--color-background-gray": "#e5e5e5",
    "--color-border-gray": "#d4d4d4",
    "--color-icon-gray": "#525252",
    "--color-text-gray": "#262626",

    // =========================================================================
    // Radius — the house ladder. Rounder than the Astryx defaults; carried
    // into MedArbeiter Hub in a later phase.
    // =========================================================================
    "--radius-none": "0.25rem",
    "--radius-inner": "0.5rem",
    "--radius-element": "0.75rem",
    "--radius-container": "1rem",
    "--radius-page": "1.75rem",
    "--radius-full": "9999px",

    // =========================================================================
    // Shadows — light mode only, so just the light-mode drops (matches
    // Astryx defaults: 5%/10% low+med, 10%/15% high). No dark-mode rim
    // highlight, since this theme never renders on a dark page background.
    // =========================================================================
    "--shadow-low": "0 2px 4px oklch(0 0 0 / 5%), 0 4px 8px oklch(0 0 0 / 10%)",
    "--shadow-med": "0 2px 4px oklch(0 0 0 / 5%), 0 4px 12px oklch(0 0 0 / 10%)",
    "--shadow-high":
      "0 4px 6px oklch(0 0 0 / 10%), 0 12px 24px oklch(0 0 0 / 15%)",
    "--shadow-inset-hover": `inset 0px 0px 0px 2px ${PALETTE.gold}4D`,
    "--shadow-inset-selected": `inset 0px 0px 0px 2px ${PALETTE.bronzeText}`,
    "--shadow-inset-success": `inset 0px 0px 0px 2px ${PALETTE.successFill}4D`,
    "--shadow-inset-warning": `inset 0px 0px 0px 2px ${PALETTE.warningFill}4D`,
    "--shadow-inset-error": `inset 0px 0px 0px 2px ${PALETTE.errorFill}4D`,
  },

  components: {
    // =========================================================================
    // Button — destructive uses the pastel red treatment: white-on-red only
    // reaches 4.14:1 (see lib/contrast.test.ts), below the 4.5:1 text floor.
    // =========================================================================
    button: {
      "variant:destructive": {
        backgroundColor: "var(--color-error-muted)",
        color: "var(--color-error)",
      },
    },

    // =========================================================================
    // Badge —
    //   Semantic (info/success/warning/error): filled saturated stop +
    //     contrasting text (white, or dark on warning orange).
    //   Categorical (blue/green/red/orange/etc.): pastel-tinted hue surface
    //     + colored text — soft T87-T90 bg + dark T30 text.
    //   Neutral: light gray bg + dark text.
    // =========================================================================
    badge: {
      "variant:info": {
        backgroundColor: PALETTE.infoFill,
        color: PALETTE.white,
      },
      "variant:neutral": {
        // Mirrors the gray categorical badge — same neutral chip treatment,
        // sourced from the gray hue tokens, so a single change at the
        // token layer updates both variants.
        backgroundColor: "var(--color-background-gray)",
        color: "var(--color-text-gray)",
      },
      "variant:success": {
        backgroundColor: PALETTE.successFill,
        color: PALETTE.white,
      },
      "variant:warning": {
        // Orange, not yellow — keeps warnings visually distinct from the
        // brand-gold accent. Dark text clears AA.
        backgroundColor: PALETTE.warningFill,
        color: PALETTE.warningInk,
      },
      "variant:error": {
        backgroundColor: PALETTE.errorFill,
        color: PALETTE.white,
      },

      // Categorical — bg + text reference the per-hue tokens, so behavior
      // tracks the categorical palette automatically: pastel T87-T90 bg +
      // dark T30 colored text (low-key chip).
      "variant:red": {
        backgroundColor: "var(--color-background-red)",
        color: "var(--color-text-red)",
      },
      "variant:orange": {
        backgroundColor: "var(--color-background-orange)",
        color: "var(--color-text-orange)",
      },
      "variant:yellow": {
        backgroundColor: "var(--color-background-yellow)",
        color: "var(--color-text-yellow)",
      },
      "variant:green": {
        backgroundColor: "var(--color-background-green)",
        color: "var(--color-text-green)",
      },
      "variant:teal": {
        backgroundColor: "var(--color-background-teal)",
        color: "var(--color-text-teal)",
      },
      "variant:cyan": {
        backgroundColor: "var(--color-background-cyan)",
        color: "var(--color-text-cyan)",
      },
      "variant:blue": {
        backgroundColor: "var(--color-background-blue)",
        color: "var(--color-text-blue)",
      },
      "variant:purple": {
        backgroundColor: "var(--color-background-purple)",
        color: "var(--color-text-purple)",
      },
      "variant:pink": {
        backgroundColor: "var(--color-background-pink)",
        color: "var(--color-text-pink)",
      },
      "variant:gray": {
        backgroundColor: "var(--color-background-gray)",
        color: "var(--color-text-gray)",
      },
    },

    // =========================================================================
    // StatusDot — fill uses the SAME vivid stops as the filled semantic
    // Badge (and ProgressBar), so a dot and its badge read as one status
    // language.
    //
    // The default component maps each variant to a raw semantic token
    // (--color-success / --color-error / --color-warning / --color-icon-
    // secondary), which in light mode are the dark T30/T40 stops meant to
    // sit as TEXT on a pastel surface — as a solid dot they read muddy
    // (dark green / maroon / brown). Redirect them to the badge fills.
    //
    // `neutral` and `accent` are intentionally NOT overridden here: neutral
    // keeps the component default's visible mid-gray, and this theme has
    // no generic use for a filled-gold status dot (Hub binds it to worked
    // time — a MedArbeiter Hub extension, not house language).
    // =========================================================================
    statusdot: {
      "variant:success": { backgroundColor: PALETTE.successFill },
      "variant:warning": { backgroundColor: PALETTE.warningFill },
      "variant:error": { backgroundColor: PALETTE.errorFill },
    },

    // =========================================================================
    // Banner — sits on a hue-tinted surface with colored text/icon: pastel
    // T90 bg (pulled from --color-{X}-muted / --color-background-blue) +
    // dark T30 colored text (--color-text-{hue}).
    //
    // The inner-header *-muted token is forced transparent so the outer
    // tinted background shows through cleanly.
    //
    // Status overrides reference --color-text-{hue} so text/icon colors
    // stay in sync with the palette anchors automatically.
    // =========================================================================
    banner: {
      "status:info": {
        backgroundColor: "var(--color-background-blue)",
        "--color-accent-muted": "transparent",
        "--color-text-primary": "var(--color-text-blue)",
        "--color-text-secondary": "var(--color-text-blue)",
        "--color-accent": "var(--color-text-blue)",
      },
      // success/warning/error banner bgs come from --color-{X}-muted, which
      // already carries the correct tinted value. We only need to redirect
      // the text/icon to the palette colored stop.
      "status:success": {
        "--color-text-primary": "var(--color-text-green)",
        "--color-text-secondary": "var(--color-text-green)",
        "--color-success": "var(--color-text-green)",
      },
      "status:warning": {
        "--color-text-primary": "var(--color-text-yellow)",
        "--color-text-secondary": "var(--color-text-yellow)",
        "--color-warning": "var(--color-text-yellow)",
      },
      "status:error": {
        "--color-text-primary": "var(--color-text-red)",
        "--color-text-secondary": "var(--color-text-red)",
        "--color-error": "var(--color-text-red)",
      },
    },

    // =========================================================================
    // TextInput — no per-status overrides needed. The global tokens
    // --color-{success,error,warning} carry the correct values for both
    // surfaces the input border/icon touches: the input surface (white) and
    // the status message bubble (pastel T90). Verified all combinations
    // clear the AA non-text 3:1 floor.
    // =========================================================================

    // =========================================================================
    // Switch — off-state track uses the same lifted-neutral surface as the
    // ProgressBar track (--color-border-emphasized). Aligns the two
    // "channel-on-body" components so their off-states share one visual
    // language: T85 #d4d4d4 sits one step darker than the body T95 bg — a
    // defined channel, not a wash that blends in.
    // =========================================================================
    switch: {
      base: {
        "--color-background-gray": "var(--color-border-emphasized)",
      },
    },

    progressbar: {
      base: {
        // Track uses --color-background-muted; override it to
        // --color-border-emphasized (Neutral T85 #d4d4d4) so the track is
        // clearly darker than the body bg (Neutral T95 #f1f1f1) and reads
        // as a defined channel rather than blending in.
        "--color-background-muted": "var(--color-border-emphasized)",
      },
      // Vivid stops match the filled semantic badge colors (info/success/
      // warning/error variants in the badge override above). `accent` is
      // intentionally NOT overridden here — Hub binds progress-accent to
      // worked time, a MedArbeiter Hub extension, not house language.
      "variant:success": {
        "--color-success": PALETTE.successFill,
      },
      "variant:warning": {
        "--color-warning": PALETTE.warningFill,
      },
      "variant:error": {
        "--color-error": PALETTE.errorFill,
      },
    },

    // =========================================================================
    // Card — tighter padding via the public card padding token.
    // =========================================================================
    card: {
      base: {
        padding: "var(--spacing-3)",
      },
    },

    // =========================================================================
    // Section — tighter padding via the public section padding token.
    // =========================================================================
    section: {
      base: {
        padding: "var(--spacing-3)",
      },
    },

    // Heading and text component overrides are auto-generated by
    // typography.scale. h3/h4 bold weights come from
    // typography.heading.weights above.
  },

  // ===========================================================================
  // On the inverted surface — the attention notification, and nothing else.
  //
  // Astryx's own account of this: `MediaTheme` flips `color-scheme`, and
  // every `light-dark()` pair is meant to flip to its dark half on its own.
  // Measured in the browser, it does not — a custom property resolves where
  // it is declared (at `:root`, i.e. light), not where it is used. On the
  // ink surface that would leave stone #67625a (2.8:1) and bronze #7c5f05
  // (2.0:1): unreadable, exactly the class of bug lib/contrast.test.ts
  // guards against.
  //
  // So this states explicitly what the inverted surface needs, rather than
  // relying on a light/dark pairing this theme does not carry (light mode
  // only — see the header comment). Each value below is chosen to read
  // clearly against the ink background (`--color-background-inverted`
  // above).
  // ===========================================================================
  onDark: {
    tokens: {
      "--color-text-secondary": "#a9a49a",
      "--color-text-accent": "#eece6d",
      "--color-icon-accent": "#eece6d",
      "--color-icon-secondary": "#a3a3a3",
      "--color-warning": "#ffc9a2",
      "--color-error": "#ffc6c1",
      "--color-success": "#9fe59b",
      // So a tinted button has a tint to show on the ink surface at all,
      // and its hover is visible: black-on-black would give neither.
      "--color-neutral": "#FFFFFF1A",
      "--color-border": "#FFFFFF1A",
      "--color-overlay-hover": "#FFFFFF0D",
      "--color-overlay-pressed": "#FFFFFF1A",
    },
  },
});
