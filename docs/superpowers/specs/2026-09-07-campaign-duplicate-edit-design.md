# Kampagnen duplizieren und bearbeiten

**Datum:** 2026-09-07  
**Status:** Umgesetzt  
**Scope:** `/campaigns/new?from=<id>` und `/campaigns/new?edit=<id>`, `lib/seed.ts`, Update-Pfad in `lib/launch.ts`

## Zweck

Bisher entstand jede Kampagne aus einer ClickUp-Aufgabe. Wer eine laufende
Kampagne für einen weiteren Standort oder nach einer Pause noch einmal wollte,
musste sie im Ads Manager kopieren – am Assistenten, an der Werkstatt und an
den Textwerkzeugen vorbei. Ändern ging nur für Status und Tagesbudget in der
Tabelle.

Beides läuft jetzt durch denselben Assistenten wie ein Auftrag. Die Kampagne
ist die Quelle statt der Aufgabe; die KI-Hinweise, die Herkunftsetiketten und
das Neuschreiben von Texten bleiben, wie sie sind.

## Duplizieren

Duplizieren ist kein Kopieren bei Meta. `readCampaignSeed()` liest die Kampagne
(Name, Budget, Limit, je Anzeigengruppe Targeting, Lead-Formular, Texte aus dem
`asset_feed_spec`, je Anzeige Video-ID oder Bild-Hash) in einen
`CampaignSeed`. `stateFromSeed(seed, { mode: "copy" })` baut daraus den
Entwurf: heutiges Datum, Name neu nach der Konvention (Rollen aus dem alten
Namen per `parseCampaignName`), Kunde über die Seite aus `promoted_object`,
Benefits aus der ✅-Liste der Beschreibung. Videos und Bilder werden nicht neu
hochgeladen – sie liegen im Werbekonto und die Anzeigen zeigen auf dieselben
IDs. Angelegt wird wie immer: pausiert, über `/api/launch`.

## Bearbeiten

`mode: "edit"` liest denselben Seed, behält den Namen und merkt sich die
Meta-IDs (`existingAdSetId`, `existingAdId`, `state.editing`). Beim Übernehmen
läuft `launch()` mit `update: true`:

- Kampagne: Name, Tagesbudget, Ausgabenlimit per POST. Der Status bleibt.
- Anzeigengruppe mit ID: Name und Targeting per POST. Ohne ID: anlegen wie bisher.
- Anzeige mit ID: unverändert (Formular, Texte, Beschreibung, Motiv gleich wie
  im frisch gelesenen Seed) → nichts, außer der Name wich ab. Geändert → neue
  Anzeigengestaltung, die Anzeige zeigt auf sie. Ohne ID: anlegen wie bisher.
- Was bei Meta steht und im Entwurf fehlt, wird gelöscht (DELETE). Anzeigen,
  die der Seed nicht abbilden konnte (Karussell u. ä.), stehen nicht im Entwurf
  und werden nicht angefasst – sie tragen eine Warnung.

## Festgelegte Grenzen

- Der Seed kennt nur, was der Assistent selbst schreibt. Fremde Formate fallen
  mit Warnung heraus.
- Die Ausrichtung eines Einzelbildes ist beim Lesen unbekannt und gilt als
  quadratisch; ein Paar liest sie aus dem Platz in den Regeln.
- Löschungen zählt der Fortschrittsnenner nicht mit.
- Neue Anzeigen in einer aktiven Kampagne entstehen wie bisher aktiv.
- Keine Bearbeitung des Status im Assistenten – dafür bleibt die Tabelle.
