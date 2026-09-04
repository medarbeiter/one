# MedArbeiter One — Kampagnen-Assistent v2: Auftrag → Vorschlag → Anlegen

**Date:** 2026-09-02
**Status:** Approved in chat, ready for implementation planning
**Scope:** `app/campaigns/new/*`, `app/campaigns/actions.ts`, `lib/clickup.ts` (neu),
`lib/brief.ts` (neu), `lib/drive.ts`, `lib/forms.ts`, `lib/naming.ts`

---

## 1. Zweck

Der Assistent unter `/campaigns/new` ist heute vier gleichrangige Formularschritte
(Kunde, Anzeigen, Details, Überprüfung). Jedes Feld will ausgefüllt werden, obwohl
fast alles schon irgendwo steht: der Auftrag in ClickUp, die Benefits in der
Onboarding-Tabelle im Drive, der Standort in der letzten Kampagne, das Kürzel im
Login. Rollen werden in Schritt 3 gefragt, aber die Texte in Schritt 2 generiert –
der Generator läuft deshalb meist ohne sie.

v2 dreht das um: **die Person wählt einen Auftrag, die App baut den Vorschlag, die
Person korrigiert und legt an.** Drei Schirme, von denen nur der erste etwas fragt.

Was Meta nicht kann, bleibt bei Meta: Lead-Formulare mit bedingter Logik entstehen
weiter im Baukasten (Spec vom 2026-08-16, §8 – API-Formulare sind sofort aktiv und
für immer unveränderlich). Der Assistent übernimmt die Übergabe, nicht den Bau.

## 2. Entscheidungen

| Frage | Entscheidung |
|---|---|
| Einstieg | Liste der ClickUp-Aufgaben im Status `kampagne anlegen`, workspace-weit |
| Ohne ClickUp-Aufgabe | Weiter möglich: Kunden-Typeahead wie heute, Rest leer |
| Aufgabe in anderem Status | Suchfeld auf Schirm 1: filtert die Liste (Kunde, Name, Zuständige), „Nur meine“, und nimmt einen ClickUp-Link oder eine Aufgaben-ID – die lädt jede Aufgabe, egal in welchem Status (Ergänzung 2026-09-02) |
| Kunde → Meta-Seite | Ordnername der Aufgabe, unscharf gegen die Kundenliste (`resolveClientByName`); kein Treffer → Typeahead mit dem Namen vorbelegt |
| Tagesbudget, Ausgabenlimit | Custom Fields `Tagesbudget` (currency), `Ausgabenlimit` (Text, „2435€") |
| Rollen | Die Aufgabe vor der Tabelle: Custom Field `gesuchte Stellen`, sonst die Beschreibung (Mistral-Feld `stellen`), sonst der Aufgabenname; schweigt die Aufgabe, der Block „Welche fachlichen Voraussetzungen muss der Kandidat erfüllen?“ der Onboarding-Tabelle, sonst „Offene Stellen:“ aus der Kundenübersicht. Stellen kommen als Titel, wie sie dastehen; `rolesFromTitles` macht Kürzel daraus, wo Kürzel oder Label passen (auch „Pflegekräfte (PFK)“, „sPDL“), der Rest steht als Freitext-Rolle („Praxisanleiter“) – der Assistent darf Stellen nennen, die die Liste nicht kennt (Ergänzung 2026-09-04) |
| Benefits | Onboarding-Tabelle, Block „Wie gestaltet sich Ihr Jobangebot?" → nur „Besteht aktuell", nie „Weitere Vorschläge" |
| Standort | Beschreibung der Aufgabe (Mistral), sonst die Zeile „Adresse:“ im ClickUp-Doc „Kundenübersicht“ des Kundenordners (Regex, nie ans Modell – das Doc trägt Passwörter), sonst letzte Kampagne des Kontos (bestehendes Prefill) |
| Drive-Ordner | Custom Field `Drive-Link`, sonst `bestLanding()` |
| Kürzel | Aus dem Namen der angemeldeten Person (Session), überschreibbar |
| Pflicht (immer sichtbar) | Kunde, Standort, Lead-Formular, Tagesbudget |
| Optional (eingeklappt) | Werbekonto, Startdatum, Ausgabenlimit, Kampagnenname, Kürzel |
| Lead-Formular | Baukasten-Link; ein nach dem Öffnen des Assistenten neu erschienenes Formular wird automatisch gewählt |
| Texte | Beim Betreten des Vorschlags sofort generiert, kein Dialog; „Neu generieren" je Block bleibt |
| Drive-Dateien | Als Kacheln gezeigt, „Alle übernehmen" ein Klick; nichts geht ohne Klick zu Meta |
| Nach dem Anlegen | ClickUp-Aufgabe → `abnahme kampagne`, Kommentar mit Kampagnenname und Ads-Manager-Link |
| Freitext-Anweisungen der Aufgabe | Wörtlich als „Hinweise aus der Aufgabe" neben dem Vorschlag – nicht interpretiert |
| Herkunft | Jedes vorbelegte Feld trägt ein Herkunftsetikett (ClickUp / Onboarding-Tabelle / letzte Kampagne / Anmeldung) |
| Entwurfsformat | `drafts:v2` – alte Entwürfe werden ignoriert, wie bei v1→v2 und v2→v3 des Einzelentwurfs |
| Übersprungen | Freitext-Auftrag, den Mistral in Felder zerlegt; Parsen von Kommentaren; Formularbau |

## 3. Die drei Schirme

### 3.1 Auftrag

Eine Liste, keine Felder. Jede Zeile eine ClickUp-Aufgabe im Status `kampagne
anlegen`: Kunde (Ordnername), Aufgabenname, Verantwortliche, Tagesbudget. Eigene
Aufgaben zuerst (Session-E-Mail gegen die Assignees), dann nach Erstelldatum. Darunter
ein Textlink „Ohne Aufgabe beginnen", der den heutigen Kunden-Typeahead zeigt.

Die Entwurfsliste (`Entwuerfe`) steht wie heute über dem Schirm; ein fortgesetzter
Entwurf springt direkt in den Vorschlag.

Klick auf eine Zeile → `briefAction(taskId)` (§4) → Vorschlag. Solange die Aktion
läuft, zeigt die Zeile einen Spinner; ein Fehler steht als Banner über der Liste, die
Liste bleibt bedienbar.

### 3.1a Die Werkstatt (Ergänzung 2026-09-02)

Klick auf eine Zeile öffnet keinen Spinner, sondern die **Werkstatt**: die Liste
weicht dem gewählten Auftrag als Kopf und darunter einer Zeile je Quelle – alle
sofort da, noch grau (der Plan), dann der Reihe nach laufend (Marke atmet) und
fertig (Haken, darunter in einem Satz das Gefundene mit Herkunftsetikett:
„17,05 € pro Tag · Rollen FK“ aus ClickUp, „15 Benefits aus ‚Besteht aktuell‘“
aus der Onboarding-Tabelle). Eine Schiene verbindet die Marken wie in der
Schrittleiste; die Marke „Vorschlag“ in der Schrittleiste pulst mit. Zuletzt die
Zeile „Kunde in der Meta-Kundenliste finden“; nach dem letzten Haken ein Bogen
(700 ms), dann öffnet sich der Vorschlag.

Technisch: `GET /api/brief?task=` streamt NDJSON (`BriefEvent` aus `lib/brief.ts`,
`assembleBrief(taskId, deps, emit)`), wie `/api/launch`. Die `briefAction` entfällt.
Client-seitig sammelt `activity.ts` (Store wie `upload-queue.ts`) alle Meldungen –
auch die aus dem Vorschlag: Texte (Mistral, mit Zähler „3 von 5“), Drive-Regal,
Lead-Formulare, letzte Kampagne. `werkstatt.tsx` rendert daraus `Aufbau` (Schirm 1)
und `Werkstattleiste` (Schirm 2: eine Zeile „Der Assistent arbeitet: Primärtexte
schreiben · Drive-Ordner öffnen…“, aufklappbar zum ganzen Protokoll; danach
„Der Vorschlag steht · 9 Quellen gelesen · Etiketten stehen an den Feldern“).

Bewegung nur aus `theme/motion.css`: Zeilen kommen per `step-enter` (transform),
gestaffelt 60 ms; das Gefundene rollt per `zahl-rollt`; der Hof der laufenden
Marke atmet im Takt des KI-Schimmers (2,4 s). Alles unter `prefers-reduced-motion`
stehend.

**Mehrere Standorte, Umkreis, Inhalt zuerst (Ergänzung 2026-09-02):** Mistral liest
aus der Beschreibung *alle* Zielstandorte (`standorte: []`). Jeder weitere wird eine
eigene Anzeigengruppe, benannt nach dem Ort (`cityOf`), die die Anzeigen der ersten
spiegelt (`mirrorOf`, in `syncLinkedAds`): Videos einmal in die erste ziehen, sie
liegen in allen. Texte schreibt jede Gruppe selbst (der Ort steht drin). Wer die
Anzeigen eines Spiegels anfasst, übernimmt ihn. Den Umkreis wählt der Assistent
(`fitRadiusAction`): ab 17 km die Leiter 17·20·25·30·40·50·65·80 hinauf, bis Metas
Schätzung mindestens 150 000 Menschen nennt; ein von Hand oder aus der letzten
Kampagne gesetzter Radius bleibt – ebenso ein in der Aufgabe genannter („Umkreis
30 km“, Mistral-Feld `umkreis_km`, sonst die Zeile „Umkreis:“ der Kundenübersicht;
Ergänzung 2026-09-04). Solange irgendetwas läuft, zeigt der Vorschlag nur
den Inhalt der ersten Gruppe – das Einzige, was in der Zeit von Hand zu tun ist;
Kopf, Standort, Formular, Texte, Optional und Vorschau erscheinen, sobald alles
steht, und bleiben dann stehen.

### 3.2 Vorschlag

Eine Seite, sieben Abschnitte, jeder mit Skelett bis seine Antwort da ist. Rechts
klebend das Telefon (`Preview`) – es zeigt Texte und Anzeigen, sobald es sie gibt.

1. **Kopf** – Kampagnenname als Ergebnis („MeVita Pflegedienst GmbH - PFK ab 02.09.26
   KF (via One)"), darunter Rollen-Chips mit Herkunft, Kürzel, Startdatum. Rollen
   sind hier änderbar (MultiSelector + Freitext wie heute); der Name folgt.
2. **Hinweise aus der Aufgabe** – die Beschreibung der ClickUp-Aufgabe, wörtlich,
   in einer `Infotafel`. Fehlt sie oder gibt es keine Aufgabe, fehlt der Abschnitt.
3. **Standort** – `LocationField` wie heute, vorbelegt, mit Herkunft. Pflicht.
4. **Lead-Formular** – Typeahead wie heute, dazu der Baukasten-Link (`instantFormsUrl`,
   neuer Tab) und die Überwachung aus §5. Pflicht.
5. **Inhalte** – das Drive-Regal (§6) und darunter das bestehende `ContentGrid` mit
   Ablagezone. Pflicht ist mindestens eine Anzeige (`adSetBlockers` unverändert).
6. **Texte** – `TextListField` × 2 und Beschreibung wie heute, aber beim Betreten
   sofort generiert. Benefits stehen als editierbares Feld direkt darüber, mit
   Herkunft; „Neu generieren" nimmt den aktuellen Feldstand.
7. **Optional** – `Collapsible`: Werbekonto, Startdatum, Ausgabenlimit,
   Kampagnenname (mit `nameEdited`-Regel), Kürzel. Tagesbudget steht *nicht* hier,
   sondern als Pflichtfeld neben dem Standort.

„Standort hinzufügen" bleibt: ein zweiter Standort ist eine zweite Anzeigengruppe
mit geliehenen Anzeigen und Texten (`syncLinkedAds`, unverändert). Bei mehreren
Standorten bekommt jeder seinen Abschnitt 3–6 als `Collapsible` wie heute in
Schritt 2; der Kopf und Optional bleiben einmal.

Fußzeile: Zurück, Entwurf speichern, „Weiter: Anlegen". Offene Punkte zählen wie
heute an der Schrittleiste (`Stepper` mit drei Schritten).

### 3.3 Anlegen

Heutiger Schritt 4 ohne die doppelte Zusammenfassung: Prüfliste (Standorte mit
Zähler), Blocker-Banner, Überlappungs-Hinweis, Fortschritt, Quittung. Rechts das
Telefon. Knopf „Erstellen (pausiert)".

Nach Erfolg (`receipt.campaignId` gesetzt): `closeBriefAction(taskId, campaignId,
name)` setzt den ClickUp-Status und schreibt den Kommentar. Ein Fehler dort steht
in der Quittung als Zeile („ClickUp nicht aktualisiert: …"), die Kampagne ist
trotzdem angelegt – wie heute bei `refreshCampaignsAction`.

## 4. Der Auftrag (`lib/brief.ts`, `lib/clickup.ts`)

### 4.1 ClickUp (`lib/clickup.ts`)

Kein SDK. Token aus `CLICKUP_API_TOKEN`, Team-ID beim ersten Aufruf über
`GET /team` gelesen und im Modul gecacht (ein Workspace).

```ts
export type Brief = {
  taskId: string;
  name: string;
  customer: string;          // Ordnername
  assignees: string[];       // E-Mails
  description: string;       // Markdown, roh
  dailyBudgetEuros?: number; // Custom Field "Tagesbudget"
  spendCapEuros?: number;    // Custom Field "Ausgabenlimit", geparst
  rolesText?: string;        // Custom Field "gesuchte Stellen"
  driveUrl?: string;         // Custom Field "Drive-Link"
  createdAt: number;
};

export async function listOpenBriefs(): Promise<Brief[]>;   // status = kampagne anlegen
export async function getBrief(taskId: string): Promise<Brief>;
export async function closeBrief(taskId: string, comment: string): Promise<void>;
```

`listOpenBriefs` ruft `GET /team/{id}/task?statuses[]=kampagne anlegen&subtasks=false`
und folgt der Seitenzahl, bis eine Seite leer ist (heute 2 Aufgaben, die Liste
bleibt klein). `closeBrief` ist `PUT /task/{id}` mit `status: "abnahme kampagne"`
plus `POST /task/{id}/comment`.

Reine, testbare Helfer:

- `parseEuro("2435€") → 2435`, `parseEuro("17,05 €") → 17.05`, Müll → `undefined`.
- `parseRoles("FK")`, `parseRoles("PFK/PDL")`, `parseRoles("s. OB") → []` – Tokens
  gegen `ROLES[].code` (Groß/Klein egal); Unbekanntes wird `roleFreeText`.
- `rolesFromTaskName("MeVita … - PFK Renningen ab x.9.26 KF (via One)")` – der Teil
  zwischen „ - " und „ ab ", durch `parseRoles`.

### 4.2 Zusammenbau (`lib/brief.ts`)

`assembleBrief(taskId, deps)` – Server, ein Aufruf, alle Quellen parallel:

| Quelle | Liefert | Herkunft |
|---|---|---|
| ClickUp-Aufgabe | Kunde, Budget, Limit, Rollen, Drive-Link, Beschreibung | `clickup` |
| Mistral über die Beschreibung | Standort (Adresse oder Ort), Hinweis auf ein Formular (Name/Ort), sonst nichts | `clickup` |
| Drive: Onboarding-Tabelle | Benefits, fachliche Voraussetzungen | `onboarding` |
| Mistral über die Tabelle | Benefits als Zeilen, Rollen als Codes | `onboarding` |
| `lastCampaignDefaults` | Standort, Radius (nur wenn die Beschreibung keinen nennt) | `previous` |
| Session | Kürzel | `session` |

Ergebnis:

```ts
export type Source = "clickup" | "onboarding" | "previous" | "session";
export type Sourced<T> = { value: T; source: Source };
export type AssembledBrief = {
  taskId?: string;
  clientName?: Sourced<string>;
  roles?: Sourced<string[]>;
  roleFreeText?: Sourced<string>;
  benefits?: Sourced<string>;
  location?: Sourced<Prefill>;          // addressString/place/radiusKm
  formHint?: Sourced<string>;            // „Renningen"
  dailyBudgetEuros?: Sourced<number>;
  spendCapEuros?: Sourced<number>;
  driveFolderId?: Sourced<string>;
  initials?: Sourced<string>;
  notes?: string;                        // Beschreibung, wörtlich
};
```

Jede Quelle darf ausfallen; ein Ausfall lässt ihr Feld leer und schreibt eine Zeile
in `warnings: string[]`, die der Vorschlag als Hinweis-Banner zeigt („Onboarding-
Tabelle nicht gefunden – Benefits bitte eintragen"). Nichts davon blockt.

Mistral-Aufrufe laufen über `mistral()` aus `lib/bodies.ts` mit `temperature: 0`
und JSON-Antwort; die Parser (`parseLocationHint`, `parseOnboarding`) sind rein und
testbar wie `parseTitles`.

**Onboarding-Tabelle lesen (`lib/drive.ts`):**
`findSheet(folderId)` sucht im Kundenordner (Drive-Link oder `bestLanding().path[0]`)
rekursiv, höchstens drei Ebenen, nach einer Tabelle, deren Name `onboarding` enthält;
`exportCsv(fileId)` holt `files/{id}/export?mimeType=text/csv` (drive.readonly reicht).
Die CSV geht ungekürzt an Mistral – die Tabelle ist zwei Bildschirme groß, das ist
billiger als ein Zellenparser für ein Layout, das je Kunde leicht abweicht. Der
Prompt nennt die Regel wörtlich: Benefits nur aus „Besteht aktuell", nie aus
„Weitere Vorschläge".

**Kürzel (`lib/naming.ts`):** `initialsOf("Karl Fischer") → "KF"`; ein Wort →
erste zwei Buchstaben, groß. Ersetzt `KNOWN_INITIALS` und `INITIALS_KEY`
(localStorage) – wer anders heißen will, ändert es unter Optional; der Wert steht im
Entwurf.

### 4.3 Vom Auftrag zum State

`applyBrief(state, brief): WizardState` – rein, in `state.ts`. Schreibt nur in
Felder, die noch auf dem Ausgangswert stehen (dieselbe Regel wie
`untouchedPrefillPatch`), damit ein fortgesetzter Entwurf nicht überschrieben wird.
`WizardState` wächst um:

```ts
benefits: string;
taskId?: string;
sources: Partial<Record<"clientName"|"roles"|"benefits"|"location"|"dailyBudget"|"spendCap"|"initials", Source>>;
notes?: string;
formHint?: string;
driveFolderId?: string;
```

`sources` speist die Herkunftsetiketten; ein Feld, das jemand ändert, verliert sein
Etikett (der Setter löscht den Eintrag).

## 5. Lead-Formular: Übergabe statt Bau

Der Abschnitt zeigt den Typeahead wie heute und daneben „Formular in Meta bauen"
(neuer Tab). Beim ersten Betreten des Vorschlags merkt sich der Assistent die
Formular-IDs der Seite (`listFormsAction`). Solange kein Formular gewählt ist, liest
er bei `focus` und alle 30 s neu (`refresh=true`, dasselbe Muster wie die
Lead-TOS-Schleife). Ein Formular, das vorher nicht in der Liste stand, wird gewählt
und als „Neu erkannt: {Name}" ausgewiesen; die Schleife endet.

Gibt der Auftrag einen `formHint` („Renningen"), wird beim ersten Laden das
Formular gewählt, dessen Name den Hinweis enthält (unscharf, `fuzzyCustomerMatch`),
mit Etikett „aus ClickUp". Mehrere Treffer → keins wählen, Treffer oben in der Liste.

Ein Standort ohne Formular bleibt ein Blocker (`adSetBlockers`, unverändert).

## 6. Drive-Regal

`driveShelfAction(business, folderId?)` liefert die Medien des Zielordners:
mit `folderId` direkt `landing()` von dort, sonst `findFolders` + `bestLanding` wie
im Dialog. Antwort: Pfad (zum Anzeigen: „Kunden › MeVita › 1 - Recruiting › UGC
Videos") und Einträge.

Der Abschnitt zeigt den Pfad, die Medien als Kacheln mit Server-Vorschaubild
(`/api/drive?thumb=`) und zwei Knöpfe: „Alle übernehmen" (alle Medien in die
Upload-Warteschlange, `enqueue` wie der Dialog) und „Anderen Ordner wählen" (öffnet
den bestehenden `DriveDialog`). Einzelne Kacheln sind anklickbar zum einzelnen
Übernehmen. Schon übernommene Dateien (Name im `ContentGrid` bekannt) sind
ausgegraut – der zweite Klick lädt nichts doppelt.

Ohne Treffer: Satz „Kein Drive-Ordner gefunden" plus „Ordner wählen"; die
Ablagezone darunter steht ohnehin.

### 6a. Direktweg und Ordnerwahl (Ergänzung 2026-09-04)

**Ordner.** In jedem Kundenordner liegen „Beispielvideo 1.MOV“ und „Beispielvideo
2.MOV“ – zwei Vorlagen, nie gewollt. `entriesOf` blendet sie aus, damit sie den
Abstieg nicht dort anhalten, wo nur sie liegen. Fehlt die Stufe „1 - Recruiting“
(MeVita, Rottweil), geht die Leiter auf derselben Ebene mit „Werbemotive“/„UGC“
weiter. Beim Abstieg zählen „nicht verwenden“, „alt…“ und „X-Ordner“ nicht mit.
Liegen unter dem UGC-Ordner nur datierte Unterordner („13.9.26 FK Renningen“),
wählt `pickByHint` den mit den meisten Treffern aus Ort und Rollen der Aufgabe
(`?hint=Renningen,FK`) – nur bei eindeutigem Sieger, sonst bleibt es stehen.

**Upload.** Das Regal und der Dialog reichen die Drive-Einträge selbst weiter,
nicht ihre Bytes (`Pickable = File | DriveFile`). Ein Video geht als `driveId`
an `POST /api/upload`; der Server holt es per Range-Request stückweise aus Drive
und reicht es Metas stückweisem Upload weiter (`VideoSource` in `lib/uploads.ts`)
– nie ganz im Speicher, kein Byte durch den Browser, kein Encoder (Meta nimmt
HEVC und MOV, Probe 2026-09-04). Die Antwort ist ein NDJSON-Strom
(`DirectEvent`: Bytes, Ergebnis, `fallback`, `error`). Winkt der Server ab (kein
Video, kurze Kante unter 500 px) oder scheitert Meta, holt der Browser die Datei
und geht den bisherigen Weg (Umwandlung, Upload). Bilder aus Drive gehen immer
über den Browser: Fingerabdruck und Überschrift brauchen die Pixel dort. Vier
Direktwege laufen zugleich.

## 7. Datei-Aufbau

| Datei | Änderung |
|---|---|
| `lib/clickup.ts` (neu) | §4.1 |
| `lib/brief.ts` (neu) | §4.2, Prompts + Parser |
| `lib/drive.ts` | `findSheet`, `exportCsv`, `landingAt(folderId)` |
| `lib/naming.ts` | `initialsOf`; `KNOWN_INITIALS` entfällt |
| `lib/forms.ts` | unverändert (die Erkennung läuft über die Liste, nicht über Zeitstempel) |
| `app/campaigns/actions.ts` | `briefsAction`, `briefAction`, `driveShelfAction`, `closeBriefAction` |
| `app/campaigns/new/page.tsx` | liest Session (Person) und gibt `initials`, `email` an den Wizard |
| `app/campaigns/new/state.ts` | neue Felder, `applyBrief`, `drafts:v2`, `INITIALS_KEY` entfällt |
| `app/campaigns/new/wizard.tsx` | neu geschrieben um drei Schirme; Ziel ≤ 600 Zeilen |
| `app/campaigns/new/auftrag.tsx` (neu) | Schirm 1 |
| `app/campaigns/new/vorschlag.tsx` (neu) | Schirm 2, Kopf + Optional + je Standort `AdSetBlock` |
| `app/campaigns/new/drive-shelf.tsx` (neu) | §6 |
| `app/campaigns/new/ad-set-block.tsx` | Dialoge und lokaler Benefits-State raus; `benefits` als Prop; `autoGenerate` beim ersten Mount mit leeren Texten; Formular-Überwachung (§5) |
| `app/campaigns/new/benefits-dialog.tsx` | gelöscht |
| `app/campaigns/new/stepper.tsx` | `building`: die Marke des Schritts, der gerade zusammengesetzt wird, pulst |
| `app/api/brief/route.ts` (neu) | NDJSON-Stream des Zusammenbaus (§3.1a) |
| `app/campaigns/new/activity.ts` (neu) | Protokoll-Store: `report`, `useActivity`, `clearActivity` |
| `app/campaigns/new/werkstatt.tsx` (neu) | `Aufbau`, `Werkstattleiste`, Abbildung `BriefEvent` → Zeile |
| `app/campaigns/new/receipt.tsx` | Zeile für das ClickUp-Ergebnis |

Unverändert und wiederverwendet: `content-grid.tsx`, `crop-dialog.tsx`,
`drive-dialog.tsx`, `location-field.tsx`, `preview.tsx`, `upload-queue.tsx`,
`use-launch.ts`, `entwuerfe.tsx`, `angaben.tsx`, `lib/launch*.ts`, `lib/bodies.ts`.

## 8. Fehler und Grenzen

- **ClickUp nicht erreichbar / Token fehlt:** Schirm 1 zeigt ein Banner und den
  Typeahead-Weg. Nichts anderes hängt an ClickUp.
- **Kunde nicht in der Meta-Liste:** Typeahead mit dem Ordnernamen vorbelegt, Etikett
  „nicht zugeordnet". Ohne Zuordnung bleibt Schirm 2 gesperrt wie heute ohne Kunde.
- **Onboarding-Tabelle fehlt oder nicht lesbar:** Benefits leer, Warnung. Texte
  werden trotzdem generiert (der Generator kennt „keine Benefits").
- **Mistral-Extraktion liefert Unsinn:** Etikett zeigt die Herkunft, das Feld ist
  editierbar; der Standort läuft ohnehin durch `locationProblem` und die Ortssuche.
- **Zwei Personen öffnen dieselbe Aufgabe:** Kein Lock. Der Entwurf ist lokal, die
  Aufgabe wechselt erst beim Anlegen den Status; wer als Zweiter anlegt, sieht die
  zweite Kampagne in der Tabelle – wie heute.
- **ClickUp-Update nach dem Anlegen scheitert:** Zeile in der Quittung, Kampagne
  steht. Kein Retry-Knopf (ponytail: der Status ist in ClickUp in einem Klick
  gesetzt).

## 9. Tests

Nur reine Logik, `bun test` wie im Bestand:

- `lib/clickup.test.ts`: `parseEuro`, `parseRoles`, `rolesFromTaskName`, Abbildung
  Task-JSON → `Brief` mit den zwei echten Aufgaben aus der Probe vom 2026-09-02.
- `lib/brief.test.ts`: `assembleBrief` mit gestubbten Deps – jede Quelle einzeln
  ausfallend; `parseOnboarding` mit einer CSV nach dem Layout der Rottweil-Tabelle
  (Benefits nur aus „Besteht aktuell"); `parseLocationHint`.
- `lib/naming.test.ts`: `initialsOf`.
- `app/campaigns/new/state.test.ts`: `applyBrief` überschreibt keine angefassten
  Felder; Etiketten verschwinden beim Ändern; `drafts:v2` ignoriert v1.
- Formular-Erkennung: reine Funktion `newlyAppeared(before: string[], now: LeadForm[])`
  mit Test; die Schleife selbst bleibt ungetestet wie die TOS-Schleife.
