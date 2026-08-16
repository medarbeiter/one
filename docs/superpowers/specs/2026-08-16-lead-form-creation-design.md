# MedArbeiter One — Lead-Formulare aus der App anlegen

**Date:** 2026-08-16
**Status:** Verworfen — die tragende Annahme ist widerlegt, siehe §8. Es bleibt beim
Baukasten-Link im Assistenten. Dieses Dokument steht hier als Beleg, nicht als Vorhaben:
wer die Frage neu stellt, findet in §2 und §8 die Messungen statt der Vermutungen.
**Nicht umgesetzt.** Der Entwurfscode liegt unfertig auf dem Branch
`feat/lead-form-drafts` und gehört nicht nach main — er erzeugte dauerhafte,
unbrauchbare Formulare auf Kundenseiten.
**Scope (geplant, nicht gebaut):** `lib/forms.ts`, `lib/form-recipe.ts`,
`app/campaigns/actions.ts`, `app/campaigns/new/form-dialog.tsx`,
`app/campaigns/new/ad-set-block.tsx`

---

## 1. Purpose

Der Formular-Schritt kann heute nur auswählen. Wer ein neues Formular braucht,
landet über **Formular in Meta erstellen** im Baukasten, tippt dort die immer
gleiche Vorlage ab und kommt mit einer ID zurück. Bei ~200 Kunden ist das die
teuerste Handarbeit im Assistenten.

Diese Spec legt fest, wie viel davon die App übernimmt — und, ebenso wichtig,
welcher Teil bei Meta bleiben *muss*.

## 2. Was die Graph API kann und was nicht

Nachgemessen am 2026-08-16 gegen v26.0, Belege in
`docs/research/2026-08-16-meta-leadgen-forms-api.md`.

**Nicht darstellbar.** Bedingte Logik (Antwort → nächste Frage) und eine zweite
Zielseite für Nicht-Leads existieren im Datenmodell der API nicht. Auf dem
Formular-Knoten werden `thank_you_pages`, `endings`, `ending_pages`,
`custom_endings`, `conditional_logic`, `branching`, `routing` und
`disqualification` allesamt als nicht existierende Felder abgelehnt; akzeptiert
werden nur `thank_you_page` (Einzahl), `context_card`, `legal_content`, `page`,
`page_id`, `allow_organic_lead`. Metas eigene Hilfeseite zum Feature trägt den
Hinweis „only available through lead ad with instant form creation in Meta Ads
Manager".

`dependent_conditional_questions` ist **keine** Verzweigung, sondern eine
CSV-gespeiste Auswahlkette (Land → Bundesland → Ort). Für unseren Fall nutzlos.

**Darstellbar** ist alles Übrige: Intro-Karte, flache Fragenliste mit Optionen,
Datenschutz-Link, `locale`, öffentliche Freigabe, Tracking-Parameter und *eine*
Zielseite.

**Unveränderlich.** Die Updating-Tabelle des Knotens kennt genau eine Spalte:
`status`. `questions`, `thank_you_page` und `context_card` lassen sich nach dem
Anlegen nicht mehr ändern, Löschen ist nicht vorgesehen. Deshalb die
`-copy`-Namen im Bestand: geändert wird durch Duplizieren.

## 3. Die Entscheidung, die daraus folgt

Ein per API angelegtes **aktives** Formular ist eine Sackgasse: Meta lässt es
danach auch in der eigenen Oberfläche nicht mehr bearbeiten, die bedingte Logik
käme also nie hinein.

Der Nutzen entsteht nur, wenn das Ergebnis ein **Entwurf** ist, den ein Mensch in
Meta öffnet und dort um Logik und zweite Zielseite ergänzt. Die App nimmt das
Abtippen ab, Meta behält den Teil, den nur Meta kann.

| Frage | Entscheidung |
|---|---|
| Was legt die App an | Einen Entwurf, kein aktives Formular |
| Wer ergänzt die bedingte Logik | Ein Mensch in Meta, nach dem Anlegen |
| Wer ergänzt die zweite Zielseite (E2) | Ebenso |
| Was passiert mit der bestehenden Auswahl | Bleibt unverändert (ComboBox, Per-ID-Holen) |
| Wohin führt „Formular in Meta erstellen" | Künftig in einen Dialog statt in den Baukasten |
| Sprache | Immer `de_DE`, nicht wählbar |
| Freigabe | Immer öffentlich (`block_display_for_non_targeted_viewer: false`) |

## 4. Das Rezept

Abgelesen an den 249 Formularen des Bestands, nicht erfunden.

| Feld | Wert |
|---|---|
| `locale` | `de_DE` (243/249 im Bestand) |
| `block_display_for_non_targeted_viewer` | `false` (225/249) |
| `context_card.style` | `PARAGRAPH_STYLE` (235/249) |
| `context_card.title` | `Bewirb dich bei uns in {Ort} 🫶🏻` |
| `context_card.content` | `["Beantworte uns dazu ein paar Fragen und sag uns, wie wir dich erreichen können."]` |
| `question_page_custom_headline` | `Wie können wir dich am besten erreichen?` |
| `tracking_parameters` | `{ Standort: {Ort} }` |
| `privacy_policy.link_text` | `Datenschutzrichtlinie von {Kunde} ansehen.` |

Die Fragenliste in dieser Reihenfolge:

1. **Pro Kunde verschieden** — ein bis zwei Multiple-Choice-Fragen (`CUSTOM` mit
   `options`), z. B. „Was ist deine höchste Qualifikation in der Pflege?",
   „Hast du einen Führerschein?"
2. **Immer gleich** — „Wann bist du am besten erreichbar?" (`CUSTOM`, Freitext;
   119 Formulare wörtlich, ~31 weitere in Variantenschreibweise)
3. **Immer** — `FULL_NAME`, `PHONE`, `EMAIL` (242/241/240)

Der Ort kommt aus dem Standort der Anzeigengruppe, nicht aus dem Kundennamen —
so steht es im Bestand („in Hennef", „in Meerbusch", „in Coburg").

## 5. Aufbau

**`lib/form-recipe.ts` (neu, rein).** `buildFormPayload(input): FormPayload`
setzt aus Kunde, Ort, Qualifikationsfragen und Datenschutz-URL den POST-Körper
zusammen. Keine Netzanbindung, damit das Rezept ohne Meta testbar bleibt — die
Regeln aus §4 sind der eigentliche Wert und dürfen nicht in einer
Server-Action verstecken.

**`lib/forms.ts` (erweitert).** `createLeadForm(pageId, payload)` schickt den
Körper an `POST /{page-id}/leadgen_forms` mit dem Seiten-Token (`asPage`), genau
wie die vorhandenen Leser. Danach ein zweiter Aufruf, der den Status auf Entwurf
setzt (§8).

**`app/campaigns/actions.ts` (erweitert).** `createFormAction` als einziger Weg
vom Browser dorthin, im Muster von `listFormsAction`/`pullFormAction`: Fehler
kommen als Text zurück, nicht als Ausnahme.

**`app/campaigns/new/form-dialog.tsx` (neu).** Der Dialog im Muster von
`headline-dialog.tsx`. Vorbelegt aus dem Rezept, editierbar bleiben Titel der
Intro-Karte, die Qualifikationsfragen samt Optionen, die Datenschutz-URL und die
Zielseite.

**`app/campaigns/new/ad-set-block.tsx` (geändert).** Der Knopf **Formular in
Meta erstellen** öffnet künftig diesen Dialog. `instantFormsUrl()` bleibt und
wird zum Weg *nach* dem Anlegen: „In Meta öffnen und Logik ergänzen".

## 6. Ablauf

1. Mensch öffnet den Dialog, Felder sind gefüllt.
2. `createFormAction` → `buildFormPayload` → `createLeadForm`.
3. Meta antwortet mit `{id}`; das Formular wird Entwurf.
4. Das Formular reiht sich in die Liste ein und ist ausgewählt — derselbe Pfad,
   den `pullForm` heute schon geht.
5. Der Dialog zeigt zum Abschluss den Link in den Baukasten mit dem Satz, was
   dort noch fehlt: bedingte Logik und E2.

## 7. Fehler und Grenzen

`graph()` klassifiziert bereits (`token` / `permission` / `rate` / `unknown`);
der Dialog zeigt die Meldung unverändert. Zwei Fälle verdienen eigenen Text:

- **Nutzungsbedingungen nicht angenommen** — `needsLeadgenTos` ist im Assistenten
  schon bekannt. Der Dialog darf gar nicht erst öffnen, sondern zeigt
  `leadgenTosUrl(pageId)`.
- **Kein Seiten-Token** — der System User ist der Seite nicht zugewiesen.
  `pageToken()` sagt das bereits mit Handlungsanweisung; unverändert durchreichen.

Ein angelegtes Formular lässt sich nicht zurücknehmen. Deshalb ist der
Bestätigungsknopf im Dialog eindeutig beschriftet und der Dialog macht vorher
sichtbar, was entsteht.

## 8. Die tragende Annahme — widerlegt

**`DRAFT` geht nicht. Damit trägt §3 nicht mehr.**

Gemessen am 2026-08-16 auf Seite `1066791689857037` mit
`scripts/draft-probe.ts`, zwei Wege, beide gescheitert:

| Versuch | Antwort von Meta |
|---|---|
| `POST /{form-id}` mit `status=DRAFT` nach dem Anlegen | `Mutation auf ACTIVE form ist nicht zulässig` |
| `status=DRAFT` gleich beim Anlegen mitgeschickt | Angenommen, aber **stillschweigend ignoriert** — das Formular liest sich danach als `ACTIVE` |

Dazu gibt es keine Entwurfs-Edge: `leadgen_draft_forms` wird als nicht
existierendes Feld abgelehnt, `leadgen_forms_draft` und `leadgen_form_drafts`
als unbekannte Pfade.

Ein per API angelegtes Formular ist also **immer sofort aktiv und damit für
immer unveränderlich** — auch in Metas eigener Oberfläche. Bedingte Logik und
die zweite Zielseite lassen sich nachträglich nicht mehr ergänzen.

Beide Probeformulare wurden archiviert (`1966817190667773`,
`1710278570205983`) und tauchen in `listLeadForms` nicht mehr auf.

### Was daraus folgt

Der Weg dieser Spec liefert nur Formulare ohne bedingte Logik — genau das, was
laut Anforderung nicht reicht. **Der Dialog darf so nicht nach main.** Er würde
bei jedem Klick ein dauerhaftes, unbrauchbares Formular auf einer Kundenseite
hinterlassen.

Es bleiben zwei Wege, und die Entscheidung gehört nicht in diese Spec:

1. **Baukasten-Link belassen.** Die App hilft beim Formular nicht. Kostet
   nichts, ändert nichts.
2. **Metas Oberfläche automatisiert bedienen.** Der einzige Weg, der die
   bedingte Logik und E2 tatsächlich erzeugt. Teuer und dauerhaft
   wartungsbedürftig, weil der Business Manager sich ohne Ankündigung ändert.

`lib/form-recipe.ts` behält in beiden Fällen seinen Wert: das Rezept ist dort
geprüft festgehalten und wäre auch die Vorlage für eine Oberflächen-Automatik.

## 9. Tests

`lib/form-recipe.test.ts` nach dem Muster der vorhandenen `lib/*.test.ts`:

- Ort und Kundenname landen an den richtigen Stellen
- Die drei Kontaktfragen stehen immer am Ende, in fester Reihenfolge
- Die konstante Erreichbarkeitsfrage steht immer vor ihnen
- `locale` und Freigabe sind nicht überschreibbar
- Optionen bekommen stabile `key`s aus ihrem Text
- Ohne Datenschutz-URL entsteht kein Körper

Der Netzweg wird nicht gemockt; `createLeadForm` ist dünn genug, dass der Wert
im Rezept liegt.
