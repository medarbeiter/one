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
   Metas einmaligen Challenge-Aufruf. `INBOX_DB_PATH` ist optional, der Default
   `/data/inbox.sqlite` steht schon in `compose.yaml`.
   Die Meta-Werte nicht als Build Variables markieren: Der Build braucht sie
   nicht, und so landen die Geheimnisse nicht in Image-Metadaten.
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
   `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`
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
  SQLite-Ablage über Metas Webhook (`/api/webhooks/meta`) – dafür einmalig im
  App-Dashboard das Produkt „Webhooks“ auf `https://<domain>/api/webhooks/meta`
  mit dem Verify-Token zeigen lassen und das Objekt **Page** mit den Feldern
  `feed` und `messages` abonnieren (Instagram-Kommentare & -DMs reiten auf
  derselben Page-Subscription mit, ein eigenes Instagram-Webhook gibt es nicht).
  Das Abonnement je einzelner Seite ist dagegen kein manueller Schritt:
  `ensureWebhookSubscribed()` (`lib/webhook-subscribe.ts`) läuft beim Start für
  jede Seite im Portfolio, `bun run webhooks` liefert denselben Abgleich als
  Bericht von Hand – bei 200+ Kunden ist Klicken pro Kunde keine Option.

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
