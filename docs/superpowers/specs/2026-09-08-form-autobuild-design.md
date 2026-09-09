# Lead-Formular per Chrome-Erweiterung bauen

**Datum:** 2026-09-08
**Status:** Umgesetzt; Selektoren am echten Baukasten abgelesen (2026-09-08), erster
kompletter Durchlauf steht noch aus (siehe `extension/README.md`).
**Scope:** `lib/form-spec.ts`, `lib/form-questions.ts`, `lib/privacy-url.ts`,
`lib/clickup.ts` (Website aus der Kundenübersicht), `app/campaigns/actions.ts`,
`app/campaigns/new/form-builder.tsx`, `app/campaigns/new/ad-set-block.tsx`, `extension/`.

## Warum eine Erweiterung

Spec 2026-08-16 §8: die Graph API legt nur sofort aktive, unveränderliche Formulare ohne
bedingte Logik und ohne zweite Zielseite an. Beides gibt es nur im Baukasten. Also bedient
eine Erweiterung den Baukasten; die App liefert die Vorlage.

## Arbeitsteilung

| Schritt | Wer |
|---|---|
| Fragen vorschlagen (je Stelle verschieden, Ja/Nein-Qualifizierung) | Mistral, `suggestQuestions()` |
| Feste Regeln (PFK → Ausbildungsfrage, Führerschein, Erreichbarkeit, Kontakt, Enden) | `buildFormSpec()` |
| Website und Datenschutz-URL | Kundenübersicht (ClickUp) + Crawl der Website |
| Name `{Stellen/…} v{n} {Initialen}` | App, `n` = nächste freie Version in der Formularliste der Seite |
| Baukasten klicken | Erweiterung, `extension/content.js` |

## Der Vertrag: `FormSpec`

```ts
type FormSpec = {
  name: string;
  language: "Deutsch";
  sharing: "Offen";
  intro: { title: string; description: string };
  questions: { label: string; options: string[]; goto: Record<string, Goto> }[]; // Multiple Choice
  // Goto = "next" | "lead" | "nolead" | number (F-Nummer einer späteren Frage); fehlt = "next"
  freeText: string[];                    // zuletzt: „Wann bist du am besten erreichbar?“
  contact: { headline: string; fields: ["FULL_NAME", "PHONE", "EMAIL"] };
  privacyUrl: string;
  website: string;
  endings: { lead: Ending; nonLead: Ending };
};
```

Bedingte Logik ist immer an. Je Antwort steht in `goto` eins der vier Ziele des Baukastens:
`"nolead"` → „Formular schließen“ (E2), `"lead"` → „Formular senden“ (E1), eine Zahl →
„Zu einer Frage“ (nur vorwärts), sonst die nächste Frage; hinter der letzten Frage heißt
„nächste“ senden. `questionBlockers()` verlangt Vorwärts-Sprünge, Erreichbarkeit jeder
Frage und mindestens ein `"nolead"`. Fertige Fragen mit Logik stehen in
`lib/form-bricks.ts`; der Editor bietet sie als Menü, Mistral setzt sie per `{"brick":"id"}`.

## Transport

`In Meta bauen` öffnet `instantFormsUrl(pageId)` mit `#mo_form=<base64url(JSON)>`. Die
Erweiterung liest den Hash bei `document_start` (bevor die SPA ihn verwirft), legt ihn in
`sessionStorage` und arbeitet ihn ab. Das Popup nimmt die JSON auch per Einfügen an –
für Wiederholungen und zum Kalibrieren.

## Die Erweiterung

MV3, nur `business.facebook.com/latest/instant_forms*`. Alle Beschriftungen des
Baukastens stehen in einer Tabelle `T` am Anfang von `content.js`; jeder Schritt hält bei
der ersten nicht gefundenen Beschriftung an und zeigt sie im Overlay. Das ist die
Kalibrierschleife: Beschriftung anpassen, Popup → „Erneut“.

Was die Erweiterung nicht tut: speichern oder veröffentlichen. Der letzte Klick bleibt
beim Menschen, damit ein halb gebautes Formular nie unbemerkt aktiv wird.

## Rückweg

Unverändert: `newlyAppeared()` in `ad-set-block.tsx` erkennt das neue Formular beim
Zurückwechseln in den Tab und wählt es.

## Annahmen

- Formularname nutzt Rollen-Kürzel (`PFK/PA v1 JP`); Freitext-Stellen wörtlich.
- Website: Zeile `Website:` in der Kundenübersicht, sonst erste `https://`-URL dort, sonst Eingabe.
- Datenschutz: erster Link auf der Startseite mit `datenschutz|privacy`, sonst `impressum`, sonst Website.
- Mistral schlägt höchstens drei Multiple-Choice-Fragen vor; die festen Regeln haben Vorrang.
