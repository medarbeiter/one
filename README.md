# MedArbeiter One

Kampagnen anlegen und Assets sehen, ohne durch den Ads Manager zu klicken.
Next.js + HeroUI, alles gegen die Graph API (v26.0) über `lib/meta.ts`.

## Setup

```bash
bun install
bun dev          # http://localhost:3000
bun test         # Checks für lib/meta.ts
```

## Coolify

1. Repository als Anwendung anlegen und **Docker Compose** als Build Pack wählen;
   Compose-Datei ist `/compose.yaml`.
2. Beim Service `app` die Domain als `https://<domain>:3000` eintragen. Die
   Portangabe sagt Coolify, wohin Traefik intern routet; öffentlich bleibt HTTPS
   auf Port 443. Kein Host-Port-Mapping anlegen.
3. Unter Environment Variables diese Laufzeitvariablen setzen:
   ```env
   META_ACCESS_TOKEN=EAA...
   META_BUSINESS_ID=...
   META_AD_ACCOUNT_ID=act_...
   META_APP_SECRET=...
   META_WEBHOOK_VERIFY_TOKEN=...
   MEDARBEITER_URL=https://hub.med-arbeiter.de
   MEDARBEITER_CLIENT_ID=...
   MEDARBEITER_CLIENT_SECRET=...
   MEDARBEITER_REDIRECT_URI=https://<domain>/anmelden/rueckkehr
   SESSION_SECRET=...
   ```
   `META_ACCESS_TOKEN` und `META_BUSINESS_ID` sind nötig;
   `META_AD_ACCOUNT_ID` ist nur die Vorauswahl. Optional lässt sich mit
   `META_API_VERSION` die standardmäßig verwendete Version `v26.0` überschreiben
   und mit `META_SYSTEM_USER_ID` die sonst aus dem Token gelesene System-User-ID
   festlegen.
   `META_APP_SECRET` und `META_WEBHOOK_VERIFY_TOKEN` sind für `/inbox` nötig – das
   eine prüft die Signatur eingehender Webhook-Aufrufe, das andere bestätigt
   Metas einmaligen Challenge-Aufruf; `META_WEBHOOK_CALLBACK_URL`
   (`https://<domain>/api/webhooks/meta`) schaltet den Echtzeitweg überhaupt
   erst frei – nur mit ihr meldet die App das Abonnement beim Start selbst an.
   `INBOX_DB_PATH` ist optional, der Default
   `/data/inbox.sqlite` steht schon in `compose.yaml`.
   Die Meta-Werte nicht als Build Variables markieren: Der Build braucht sie
   nicht, und so landen die Geheimnisse nicht in Image-Metadaten.

   `CLICKUP_API_TOKEN` speist den Auftragseingang des Kampagnen-Assistenten
   (`lib/clickup.ts`): er liest offene Aufgaben im Status „kampagne anlegen“
   und schiebt erledigte auf „abnahme kampagne“ – das Token braucht dafür
   Schreibrecht, ein reines Leserecht reicht nicht. Die Onboarding-Tabelle im
   Kundenordner, aus der die Benefits kommen, muss eigens mit dem
   Drive-Dienstkonto geteilt sein, genau wie der Ordner selbst; fehlt die
   Freigabe, meldet der Assistent nur eine Warnung und lässt die Benefits
   leer.
4. Deployen. Coolify hängt den Service an sein verwaltetes Netzwerk und erzeugt
   Traefik-Routing sowie TLS-Zertifikate aus der Domain. Deshalb enthält Compose
   bewusst weder eigene Netzwerke noch statische Traefik-Labels.

Der Docker-Healthcheck auf `/api/health` steuert den Rollout; eine zusätzliche
Healthcheck-Konfiguration in Coolify ist nicht nötig. Das Image installiert
exakt `bun.lock`, hält Bun- und Next-Build-Caches zwischen Deployments warm und
enthält zur Laufzeit nur den Next.js-Standalone-Server. Der Container schreibt
ab der Inbox (`/inbox`) dauerhafte Daten – ein Docker-Volume unter `/data`
hält den lokalen Nachrichten-Speicher warm (`compose.yaml`).

Für einen lokalen Compose-Start alle Pflichtwerte in `.env` setzen und
`docker compose up --build` ausführen.

## Anmelden über MedArbeiter

Die App hat keine eigenen Passwörter: Wer keine Sitzung hat, wird nach
`/anmelden` und von dort zum MedArbeiter-Hub umgeleitet (OAuth
Authorization-Code, siehe `lib/hub.ts`). Der Hub zeigt dabei immer seine
Freigabeseite – mit lebender Hub-Sitzung kostet der Umweg einen Klick.
Dafür muss die App im Hub unter **/apps** registriert sein –
die Registrierung liefert `MEDARBEITER_CLIENT_ID` und (genau einmal angezeigt)
`MEDARBEITER_CLIENT_SECRET`; als Rücksprung-URL gehört dort byte-identisch
`https://<domain>/anmelden/rueckkehr` hinein. `SESSION_SECRET`
(`openssl rand -base64 32`) signiert den eigenen Sitzungs-Cookie; die Sitzung
lebt einen Arbeitstag und erneuert sich danach über denselben Umweg.

### Token besorgen (einmalig, ~5 Min)

Kein OAuth-Login – ein System-User-Token reicht und läuft nicht ab.

1. [Business-Einstellungen](https://business.facebook.com/settings/system-users?business_id=129036263212085) → **System-Nutzer** → hinzufügen, Rolle „Administrator“.
2. **Token generieren** → App „MedArbeiter One“ → Rechte:
   `ads_management`, `ads_read`, `business_management`, `pages_show_list`,
   `pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`,
   `pages_manage_engagement`, `instagram_basic`, `instagram_manage_comments`,
   `instagram_manage_messages`

   `pages_manage_engagement` trägt die beiden wegnehmenden Handgriffe der
   Inbox: einen Kommentar löschen und eine Person für die Seite blockieren.
   Für `instagram_manage_messages` braucht die App außerdem **Advanced
   Access** (App-Review). Mit dem Standard-Zugriff siebt Meta die
   Unterhaltungsliste auf Nutzer mit App-Rolle herunter und läuft bei
   betriebsamen Konten in einen Timeout – siehe die Begründung in
   `lib/graph.ts`. Einmalig für die App, nicht pro Kunde.
3. Token in `.env.local`, `META_AD_ACCOUNT_ID` ist nur die Vorauswahl:
   ```
   META_ACCESS_TOKEN=EAA...
   META_AD_ACCOUNT_ID=act_123456789
   ```
4. **Assets zuweisen** – passiert von selbst. Beim ersten Seitenaufruf gleicht
   die App ab, welche Werbekonten und Seiten des Portfolios dem System-Nutzer
   noch fehlen, und weist genau die zu. Von Hand nachsehen:
   ```bash
   bun run assign     # gleicht ab, ignoriert den Merker, berichtet laut
   ```
   Die Kundenliste kommt aus demselben Portfolio und braucht keine Pflege. Was
   die Ableitung nicht wissen kann – feste Ids, mehrdeutige Werbekonten,
   Ausblendungen – steht in `lib/customers.config.ts`. Nachsehen, ob sie noch
   greift:
   ```bash
   bun run customers  # Bericht: Mehrdeutigkeiten, Konten ohne Seite, tote Overrides
   ```

## Was der Skeleton kann

- **/** – alle Werbekonten und Seiten, eigene wie von Kunden freigegebene
  (`owned_*` + `client_*`). Klick auf ein Konto → dessen Kampagnen
- **/campaigns** – Kampagnenliste + Formular: eine Kampagne → eine Anzeigengruppe
  → eine Anzeige pro hochgeladener Datei. Bilder gehen an `/adimages`, Videos an
  `/advideos` (mit Warten auf die Verarbeitung + Thumbnail). Videos werden vorher
  im Browser auf Metas Rahmen gebracht (H.264/AAC, max. 1080p und 8 Mbit/s) und
  ab 50 MB in Stücken hochgeladen – ein einzelner POST scheitert dort an „413".

Alles wird **PAUSIERT** angelegt. Scharfschalten passiert bewusst im Ads Manager,
solange hier keine Freigabe-Logik existiert.

Sonderkategorie „Beschäftigung“ ist vorausgewählt – bei Stellenanzeigen Pflicht.
Sie deaktiviert Alters-Targeting, das schickt die App dann gar nicht erst mit.

- **/inbox** – Kommentare & DMs von Facebook/Instagram in zwei Spalten: links die
  Thread-Liste, rechts Konversation samt Composer. Filterbar nach Kanal, Art und
  Beantwortet-Status, alles als URL-State. Gefüttert wird die lokale
  SQLite-Ablage aus zwei Quellen: dem Abgleich `reconcile()` (läuft nach jeder
  Antwort, holt 90 Tage zurück) und Metas Webhook (`/api/webhooks/meta`) für
  den Echtzeitweg. Beide Abonnements setzt die App selbst, sobald
  `META_WEBHOOK_CALLBACK_URL` gesetzt ist: das der App (`object=page`, Felder
  `feed` und `messages`, Rückweg + Verify-Token) und das jeder einzelnen Seite –
  einmal je Prozess, also bei jedem Deploy neu und damit auch für jede neu
  hinzugekommene Seite. `bun run webhooks` macht denselben Abgleich von Hand
  und berichtet, was scheitert – bei 200+ Kunden ist Klicken pro Kunde keine
  Option. Instagram-Kommentare & -DMs reiten auf derselben Page-Subscription
  mit, ein eigenes Instagram-Webhook gibt es nicht. Ohne
  `META_WEBHOOK_CALLBACK_URL` (lokal der Normalfall) passiert beim Start gar
  nichts und der Abgleich allein füttert die Liste.

### Namen und Profilbilder

Meta gibt beides nur heraus, wofür die App freigeschaltet ist. Der Code probiert
alle Wege in dieser Reihenfolge und begnügt sich sonst mit Initialen
(`lib/avatars.ts`):

| Kanal | Weg | Stand |
|---|---|---|
| FB-Kommentare | `from{name,picture}` am Kommentar | nur für Seiten und App-Nutzer – **409 von 432** Threads haben deshalb keinen Namen |
| FB-DMs | Name aus `participants`, Bild über `/{psid}?fields=profile_pic` | Bild braucht Advanced Access |
| IG-Kommentare | `business_discovery` je Benutzername | ~27 %: nur Unternehmens- und Creator-Konten |
| IG-Kommentare | `/{ig-id}?fields=profile_pic` | braucht Advanced Access, dann auch private Konten |
| IG, letzte Stufe | Instagrams Web-Route (`IG_SCRAPE_AVATARS=1`) | außerhalb der API-Bedingungen, siehe unten |

Drei Freigaben heben das Meiste, alle einmalig für die App, keine pro Kunde:
**`pages_read_user_content`** (Advanced) für die Namen der FB-Kommentierenden,
**Business Asset User Profile Access** für Bilder in Messenger-DMs,
**`instagram_manage_messages`** (Advanced) für IG-Profile und IG-DMs überhaupt.
Sobald eine davon durch ist, füllt sich der Posteingang beim nächsten Deploy von
allein – die Aufrufe stehen schon im Code, werden bis dahin einmal je Prozess
versucht und dann stillgelegt.

`IG_SCRAPE_AVATARS=1` schaltet die letzte Stufe frei: dieselbe interne Route,
die instagram.com im Browser benutzt. Sie liefert Bilder auch für private
Konten, steht aber nicht in Metas Plattformbedingungen – das Pfand ist der
Business Manager, an dem alle Kundenseiten und das Werbekonto hängen. Aus einem
Rechenzentrum antwortet sie ohne `IG_SCRAPE_COOKIE` und ohne `IG_SCRAPE_PROXY`
nach wenigen Aufrufen mit 401 oder 429; der erste Korb schaltet sie für den
Prozess wieder ab. Höchstens `IG_SCRAPE_MAX` Abfragen je Stunde (Vorgabe 25).

## Nicht gebaut (bewusst)

| Thema | Wann bauen |
|---|---|
| Seiten-Profil bearbeiten (Bild, Bio) | ändert sich 2× im Jahr, Aufwand > Nutzen |
| Mehrere Formate in einem Creative | wenn Feed und Reels getrennt optimiert werden sollen |
| Auth / Mehrbenutzer | wenn die App nicht mehr nur lokal läuft |

## Achtung

`META_APP_SECRET` in `.env.local` wurde im Klartext im Chat geteilt – im
[App-Dashboard](https://developers.facebook.com/apps/1078817644484423/settings/basic/)
zurücksetzen.
