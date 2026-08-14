# MedArbeiter One

Creating Meta job-ad campaigns for ~200 care-sector clients without clicking
through the Ads Manager. This is the language the campaign creator uses.

## Language

### Who is involved

**Customer**: The party whose ad account pays. Almost always MedArbeiter, the agency itself.

**Client**: The care provider being advertised for, whose page carries the ads and whose name goes in the campaign name. Never derived from the Customer — the agency pays, the Client is promoted.
_Avoid_: Business (the code's field name for the Client's name, not a separate concept)

**Page**: The Client's Facebook page. Owns the lead forms and is the identity the ads publish under.

### What gets created

**Campaign**: One job-advertising push for one Client. Carries the budget.

**Ad Set**: One geographic target within a Campaign — an address, a radius, a lead form, one pool of texts, and the Ads.
_Avoid_: Ad group, Anzeigengruppe, Location (all mean this; "Location" survives only as the UI label, because a second Ad Set exists only when the Client has a second site)

**Ad**: One thing a viewer can see, built from one or two Format Assets plus the Ad Set's shared texts.

**Creative**: Meta's `adcreative` object. Every Ad has exactly one, UGC Ads included. Never appears in the UI, and never means "the two-file kind of Ad" — that is a Split Ad.

### Media

**Format Asset**: One video or image belonging to an Ad, carrying the shape it is meant to be shown in. An Ad has one or two.

**Portrait**: The 9:16 Format Asset. Shown in Stories and Reels.
_Avoid_: Hochformat, 9:16, vertical

**Square**: The 1:1 Format Asset. Shown everywhere else, Feed included.
_Avoid_: Quadratisch, 1:1, landscape

**UGC Ad**: An Ad built from a single video, shown in every placement without being reshaped or cropped. A video is a UGC Ad — that is what the word means here.

**Split Ad**: An Ad with one Portrait and one Square Format Asset, so each placement gets media already in its shape. Images are always halves of a Split Ad; a photo is never UGC.
_Avoid_: Creative, multi-format ad, dual-format ad

**Pairing**: Deciding which Portrait and which Square belong to the same Split Ad.

**Linked Ad**: An Ad borrowed by one Ad Set from another in the same Campaign, sharing its Format Assets, pairing and name. Editing a Linked Ad detaches it.

### Texts

**Primary text**: One of up to five body texts, written per Ad Set and shared by every Ad in it. Meta calls the field `bodies`.

**Headline**: One of up to five short texts, written per Ad Set and shared by every Ad in it. Meta calls the field `titles`.

**Lead form**: The Instant Form an Ad opens. Belongs to the Client's Page, chosen per Ad Set, never created here.
_Avoid_: Instant Form, Formular
