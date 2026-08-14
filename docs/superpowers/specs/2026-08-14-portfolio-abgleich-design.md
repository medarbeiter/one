# Abgleich statt Skripte: Zuweisungen und Kunden führen sich selbst

Stand 2026-08-14. Betrifft `lib/customers.ts`, `lib/customers.config.ts`,
`app/layout.tsx`, `scripts/assign-assets.ts`, `scripts/customers.ts`; neu
`lib/assign.ts`.

## Problem

Zwei Skripte müssen von Hand laufen, und beide gehören zu Vorgängen, die ohne
Zutun passieren – ein Kunde erteilt eine Freigabe im Business Manager, ein
anderer entzieht sie.

- **`bun run assign`** weist dem System-Nutzer alle Werbekonten und Seiten zu.
  Es schreibt blind: pro Lauf ein POST je Asset, heute 193, unabhängig davon, ob
  die Zuweisung längst steht. Läuft es nicht, bekommt die App
  `(#10) User has insufficient privileges on the page` – und zwar erst beim
  Anlegen einer Kampagne, also spät.
- **`bun run customers > lib/customers.config.ts`** erzeugt die Kundenzuordnung
  aus Namensabgleich. Die Ausgabe wird von Hand nachgebessert; genau deshalb
  traut sich niemand, das Skript ein zweites Mal laufen zu lassen. Die Datei
  altert seither.

Bei rund 200 Kunden ist „nach jedem neuen Kunden neu laufen lassen“ keine
Anweisung, die man befolgen kann.

## Befund

Gemessen am 2026-08-14 gegen das echte Portfolio (nur lesende Aufrufe):

| Messung | Wert |
|---|---|
| Seiten im Portfolio / Werbekonten | 167 / 26 |
| davon dem System-Nutzer nicht zugewiesen | **0 / 0** |
| Einträge in `customers.config.ts` | 215 |
| davon Seiten, die es im Portfolio nicht mehr gibt | **48** |
| Seiten im Portfolio ohne Eintrag in der Config | 0 |
| Werbekonto-Zuordnung, die eine Neuableitung reproduziert | **167 / 167** |
| Namen, die eine Neuableitung reproduziert | 167 / 167 |
| Einträge mit gesetzter `igId` | **0 / 215** |
| Werbekonten ohne passende lebende Seite | **12 / 26** |

Drei Schlüsse daraus:

1. **Das Zuweisungsskript schreibt fast nur Redundanz.** Der Rückstand ist
   normalerweise null; die 193 POSTs pro Lauf setzen durch, was schon gilt.
2. **`customers.config.ts` ist kein Entscheidungsdokument, sondern eine alt
   gewordene Kopie des Portfolios.** Menschlicher Inhalt sind sieben Ids – und
   alle sieben nur deshalb, weil die Slug-Funktion des Skripts schlechter ist
   als das `normalise()`, das in `lib/customers.ts` bereits steht: sie kollidiert
   (`caritasaltenpflegeheimst` doppelt, `pflegeundbetreuungsdiens` doppelt) und
   verschluckt Umlaute (`schrter`).
3. **Die 48 toten Einträge sind sichtbar.** Jeder erzeugt ein Issue
   `Page … is not in the portfolio`, und `app/layout.tsx:30-34` färbt die
   Token-Anzeige davon dauerhaft auf `degraded`. Die Anzeige meldet seit Monaten
   etwas, woran niemand etwas ändern kann – und übertönt damit den Fall, für den
   sie gedacht ist.

## Entscheidung

Beide Abgleiche laufen beim Rendern, auf Daten, die die App ohnehin holt. Kein
Cron, kein Webhook, keine zusätzliche Infrastruktur.

Die Kostenfrage entscheidet sich an einem Punkt: **beide Abgleiche fragen den
Ist-Zustand gebündelt ab, nicht pro Asset.** Ein Blick pro Asset wären 193
Aufrufe; gebündelt sind es zwei.

## Teil 1 – Zuweisungen: `lib/assign.ts`

### Was Graph hergibt

Gemessen, nicht vermutet:

```
GET /{system-user}/assigned_pages?fields=id,tasks&limit=500        → 167, kein Paging
GET /{system-user}/assigned_ad_accounts?fields=id,tasks&limit=500  →  26, kein Paging
```

Zwei Aufrufe liefern den vollständigen Ist-Zustand. `tasks` kommt im selben
Aufruf mit und kostet nichts extra – damit ist nicht nur „fehlt“ erkennbar,
sondern auch „zugewiesen, aber ohne `MANAGE`“.

### Ablauf

```ts
export function missingAssets(
  portfolio: { id: string; name: string }[],
  assigned: { id: string; tasks?: string[] }[],
): { id: string; name: string }[];
```

Rein und testbar. Ein Asset gilt nur als zugewiesen, wenn seine `tasks`
`MANAGE` enthalten.

`ensureAssigned()` hält im Prozess einen Merker:

1. **Merker leer** → zwei GETs, Ids mit `MANAGE` hinein. Nach einer Stunde
   verfällt er und wird neu gefüllt; das fängt Zuweisungen ab, die außerhalb der
   App entzogen wurden.
2. **Portfolio** aus `listAssets()`. Der Aufruf trifft denselben
   Fetch-Cache (`revalidate: 300`, Tag `assets`), den das Layout eben gefüllt
   hat – **keine zusätzlichen Aufrufe**.
3. **Differenz** → `POST {asset}/assigned_users` mit `user` und
   `tasks: ["MANAGE"]`, nur für tatsächlich fehlende Assets. Erfolgreiche
   wandern in den Merker.
4. **Fehlschläge werden geparkt.** Eine Seite, deren Kunde die Partner-Freigabe
   nie erteilt hat, würde sonst bei jedem Seitenaufruf einen POST kosten – für
   immer. Sie wird einmal protokolliert und für die Laufzeit des Prozesses
   übersprungen.
5. **Ein Lauf gleichzeitig.** Ein gemerktes Promise verhindert, dass parallele
   Renderings dieselbe Zuweisung doppelt schreiben.

Der System-Nutzer wird wie bisher bestimmt: `META_SYSTEM_USER_ID ?? me.id`. Der
`me`-Aufruf passiert nur beim Füllen des Merkers und entfällt ganz, wenn die
Variable gesetzt ist. Die Begründung dafür steht ausführlich in
`scripts/assign-assets.ts` und zieht mit um: Zuweisungen wirken pro System-Nutzer,
und der Token sagt selbst, welcher das ist.

### Auslöser

`app/layout.tsx` rendert bei jedem Seitenaufruf und ruft dort bereits
`listCustomers()`. Daneben:

```tsx
after(ensureAssigned);
```

`after` (`next/server`) läuft nach der Antwort. Der Abgleich hält damit keine
Seite auf, und ein Graph-Aussetzer kann kein Rendering zerlegen. Laut
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` ist
Node-Server und Docker-Container unterstützt – beides trifft hier zu.

Der Merker lebt im Prozess. Das ist tragfähig, weil `next.config.ts` auf
`output: "standalone"` steht und das Dockerfile genau einen `node server.js`
startet: ein langlebiger Prozess für alle Anfragen. Bei mehreren Instanzen füllt
jede ihren eigenen Merker – zwei GETs pro Instanz und Stunde.

## Teil 2 – Kunden: ableiten statt erzeugen

`customers.config.ts` hört auf, das Portfolio zu spiegeln. Der Kunde wird bei
jeder Anfrage aus dem Portfolio abgeleitet; in der Datei bleibt nur, was ein
Mensch entschieden hat.

### Ableitung

`deriveCustomers(accounts, pages)` in `lib/customers.ts`, rein und getestet:

- **Ein Kunde je Seite.** Name von der Seite, Instagram aus
  `instagram_business_account` – das liefert die Portfolio-Edge bereits mit
  (101 von 167 Seiten haben eines). Der Extra-Batch aus `scripts/customers.ts`
  entfällt ersatzlos.
- **Werbekonten über den Namensabgleich**, der heute im Skript steht und nach
  `lib/customers.ts` umzieht: Rechtsform- und Branchenwörter (`NOISE`) raus, dann
  Teilstring in beide Richtungen. Er reproduziert die von Hand geprüfte Config
  für alle 167 lebenden Seiten exakt.
- **Zusätzlich ein Kunde je Werbekonto ohne passende Seite.** Das ist keine
  Kür, sondern der Grund, warum eine reine Seiten-Ableitung nicht ginge: 12 der
  26 Werbekonten haben keine lebende Seite, darunter
  `act_892281195749177` – das Konto hinter dem Kunden `medarbeiter`, das
  `payers()` (`lib/customers.ts:175`) als ersten Zahler fest verdrahtet. Beide
  MedArbeiter-Seiten stehen in der Liste der 48 verschwundenen. Ohne diese
  Klausel fiele das eigene Zahlkonto aus dem Kampagnen-Assistenten.

### Ids

Die Id kommt aus dem `normalise()`, das in `lib/customers.ts` schon steht (NFKD,
Diakritika weg, ß→ss) – nicht aus dem gröberen `norm()` des Skripts. Damit wird
aus „Ambulanter Pflegedienst Schröter“ nicht `schrter`.

Zwei Regeln halten sie stabil:

- **Getrennte Zuständigkeiten.** `NOISE` wirkt nur beim *Zuordnen* von
  Werbekonten, nicht beim *Benennen*. Für die Id zählt der volle normalisierte
  Name (auf 48 Zeichen gekürzt).
- **Kollisionen deterministisch.** Gleiche Ids bekommen ein Suffix, vergeben in
  der Reihenfolge der **Asset-Id**, nicht der Array-Reihenfolge. Die Reihenfolge
  einer Graph-Edge ist nicht zugesichert; nach Array sortiert könnten zwei
  Caritas-Häuser ihre Ids zwischen zwei Renderings tauschen.

### Overrides

`lib/customers.config.ts` schrumpft von 1351 Zeilen auf die Ausnahmen:

```ts
export type CustomerOverride = {
  /** Feste Id statt der abgeleiteten – für alles, was in URLs auftaucht. */
  id?: string;
  name?: string;
  /** Ersetzt den Namensabgleich vollständig. */
  adAccountIds?: string[];
  igId?: string;
  /** Nicht als Kunde führen. */
  hidden?: true;
};

/** Schlüssel ist die Seiten-Id, bei kontenbasierten Kunden die `act_`-Id. */
export const overrides: Record<string, CustomerOverride>;
```

Schlüssel sind Asset-Ids, weil die sich nicht ändern. Ein Override, dessen Asset
nicht mehr im Portfolio ist, wird gemeldet statt still ignoriert – sonst
entsteht dieselbe Alterung wie bisher, nur in kleinerer Datei.

`listCustomers()` behält seine Signatur; alle sechs Aufrufstellen
(`app/layout.tsx`, `app/campaigns/page.tsx`, `app/customers/page.tsx`,
`app/customers/[id]/page.tsx`, `app/campaigns/new/page.tsx` und
`lib/launch-request.ts`) bleiben unberührt.
`joinCustomers()` wird zu `deriveCustomers()` + `applyOverrides()`.

### Was sich dadurch ändert

- Ein neuer Kunde erscheint, sobald er im Portfolio steht – ohne Dateiänderung
  und ohne einen einzigen zusätzlichen Aufruf.
- Ein gekündigter Kunde verschwindet, statt als Issue liegen zu bleiben.
- Die 48 unlösbaren Issues fallen weg. `degraded` bedeutet wieder etwas.
- Die 12 bisher unsichtbaren Werbekonten (u.a. `Deutsches Kryptoinstitut`,
  `KidsCare`, `Auxilium Anhalt`) tauchen als Kunden auf. Das ist gewollt – sie
  sind im Portfolio –, aber es ist eine sichtbare Änderung der Kundenliste. Was
  nicht auftauchen soll, bekommt `hidden: true`.

## Kosten

| Lage | Aufrufe |
|---|---|
| Warmer Prozess, nichts Neues | **0** |
| Prozessstart (Deploy, Neustart) | 2 GET |
| Stündliches Nachfüllen des Merkers | 2 GET |
| Neuer Kunde im Portfolio | 1 POST je Asset (typisch 2) |
| Kunden ableiten | **0** (läuft auf `listAssets()`) |
| Heute, je Skriptlauf | ~193 POST + 6 GET, und nur wenn jemand daran denkt |

Der Portfolio-Teil (vier GETs alle 300 s) fällt weiter an, aber nicht zusätzlich:
das Layout holt ihn ohnehin für Scope-Switcher und Token-Anzeige.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| `assigned_*`-Edge nicht lesbar | Merker bleibt leer, **kein** Schreiben. Lieber gar nichts zuweisen als alles blind. |
| POST scheitert (keine Partner-Freigabe) | Einmal protokolliert, für die Prozesslaufzeit geparkt. `bun run assign` zeigt es laut. |
| Parallele Renderings | Ein Promise, ein Lauf. |
| Zuweisung außerhalb der App entzogen | Fällt spätestens beim stündlichen Nachfüllen auf. |
| Override zeigt auf verschwundenes Asset | Meldung im Doktor-Skript. |
| `after`-Callback wirft | Fängt `ensureAssigned` selbst ab; die Antwort ist längst raus. |

## Was aus den Skripten wird

- **`bun run assign`** ruft denselben Abgleich mit `force: true` (Merker
  übergehen, immer neu lesen) und behält seinen ✓/✗-Bericht. Bleibt der laute
  Weg von Hand.
- **`bun run customers`** erzeugt nichts mehr, sondern **berichtet**: mehrdeutige
  Namenstreffer, Werbekonten ohne Seite, Id-Kollisionen, Overrides ins Leere,
  Seiten ohne Werbekonto. Aus dem Generator wird der Doktor.

## Migration

1. Ableitung implementieren, `bun run customers` gibt die Tabelle alt→neu für
   alle 215 Ids aus.
2. Was in URLs oder Gewohnheiten steckt, wandert als `id` in die Overrides –
   mindestens `medarbeiter`, weil `payers()` darauf prüft.
3. Erst dann ersetzt die Overrides-Datei die generierte Config.

Ids leben nur in URLs und im Sitzungszustand: `lib/campaigns.ts:89` rechnet
`customerId` beim Lesen aus dem Live-Abgleich aus, bei Meta ist nichts unter
einer Kunden-Id abgelegt. Eine geänderte Id kostet also höchstens ein totes
Lesezeichen.

## Tests

`lib/assign.test.ts`

- `missingAssets`: fehlend / zugewiesen ohne `MANAGE` / nichts zu tun
- Merker: füllt einmal, liest warm nicht erneut, verfällt nach einer Stunde
- geparkter Fehlschlag wird nicht erneut versucht
- gleichzeitige Aufrufe erzeugen einen Lauf
- unlesbare `assigned_*`-Edge schreibt nichts

`lib/customers.test.ts` (Erweiterung)

- Ableitung reproduziert die Werbekonto-Zuordnung des Namensabgleichs
- Werbekonto ohne Seite wird eigener Kunde (`payers()` behält `medarbeiter`)
- Id-Kollision löst sich deterministisch, unabhängig von der Array-Reihenfolge
- Umlaute und ß in Ids
- Overrides überschreiben Id, Name, Werbekonten; `hidden` entfernt
- Override auf unbekanntes Asset wird gemeldet

Injizierte Abhängigkeiten wie bei `deps.listCustomers` in
`lib/launch-request.ts` – kein Netz im Test.

## Verworfen

- **Cron / geplante Route.** Bräuchte Infrastruktur neben dem Container und
  liefe auch dann, wenn niemand die App benutzt. Der Render-Auslöser kostet
  nichts und trifft den Moment, in dem das Ergebnis gebraucht wird.
- **Webhook.** Meta bietet für Zuweisungen im Business Manager keinen
  brauchbaren Auslöser; es käme ein öffentlicher Endpunkt samt Signaturprüfung
  dazu, um dasselbe zu erfahren, was zwei GETs sagen.
- **Nur Lazy-Repair** (erst reparieren, wenn `pageToken` mit `(#10)` scheitert).
  Kostet im Normalfall null, lässt einen Kunden aber so lange kaputt aussehen,
  bis ihn jemand benutzt. Der Merker macht den Vorab-Abgleich ohnehin gratis.
- **`assigned_users` je Asset lesen.** 193 GETs für dieselbe Auskunft, die zwei
  Edges gebündelt geben.
- **Asset-Id als Kunden-Id** (statt Slug). Stabil und kollisionsfrei, aber URLs
  und Logs werden unlesbar, und `payers()` verlöre seinen sprechenden Sonderfall.
- **Config weiter generieren, nur öfter.** Verschiebt das Problem: jede
  Neuerzeugung überschreibt Handarbeit, und genau deshalb unterbleibt sie.

## Offene Punkte

- **`MANAGE_LEADS`.** 165 der 167 Seiten sind ohne diese Task zugewiesen, zwei
  mit ihr. Leads werden heute gelesen, also bleibt es bei `tasks: ["MANAGE"]`.
  Sollte das je scheitern, genügt eine geänderte Konstante: der Abgleich sieht
  alle 167 Seiten als unvollständig und repariert sie einmalig selbst – rund 167
  POSTs, danach wieder null.
- **`/api/health` fehlt.** Der `HEALTHCHECK` im Dockerfile ruft es auf, unter
  `app/api/` liegen nur `launch`, `image` und `upload`. Nicht Teil dieser
  Arbeit, aber der Container gilt damit dauerhaft als ungesund.
