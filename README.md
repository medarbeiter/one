# MedArbeiter One

Kampagnen anlegen und Assets sehen, ohne durch den Ads Manager zu klicken.
Next.js + HeroUI, alles gegen die Graph API (v26.0) über `lib/meta.ts`.

## Setup

```bash
bun install
bun dev          # http://localhost:3000
bun test         # Checks für lib/meta.ts
```

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
4. **Assets zuweisen** – nicht im Dialog anklicken, sondern:
   ```bash
   bun run assign     # alle eigenen + Kundenkonten und -seiten an den System-Nutzer
   ```
   Nach jedem neuen Kunden erneut laufen lassen. Im Dialog ginge auch
   „Alle auswählen“, aber eben pro Asset-Typ und pro Neukunde wieder.

## Was der Skeleton kann

- **/** – alle Werbekonten und Seiten, eigene wie von Kunden freigegebene
  (`owned_*` + `client_*`). Klick auf ein Konto → dessen Kampagnen
- **/campaigns** – Kampagnenliste + Formular: eine Kampagne → eine Anzeigengruppe
  → eine Anzeige pro hochgeladener Datei. Bilder gehen an `/adimages`, Videos an
  `/advideos` (mit Warten auf die Verarbeitung + Thumbnail).

Alles wird **PAUSIERT** angelegt. Scharfschalten passiert bewusst im Ads Manager,
solange hier keine Freigabe-Logik existiert.

Sonderkategorie „Beschäftigung“ ist vorausgewählt – bei Stellenanzeigen Pflicht.
Sie deaktiviert Alters-Targeting, das schickt die App dann gar nicht erst mit.

## Nicht gebaut (bewusst)

| Thema | Wann bauen |
|---|---|
| Kommentare & DMs (Business Suite) | Stage 2 – erst wenn die Meta-Inbox wirklich nicht reicht |
| Seiten-Profil bearbeiten (Bild, Bio) | ändert sich 2× im Jahr, Aufwand > Nutzen |
| Mehrere Formate in einem Creative | wenn Feed und Reels getrennt optimiert werden sollen |
| Resumable Upload | wenn Videos > 500 MB auftauchen |
| Auth / Mehrbenutzer | wenn die App nicht mehr nur lokal läuft |

## Achtung

`META_APP_SECRET` in `.env.local` wurde im Klartext im Chat geteilt – im
[App-Dashboard](https://developers.facebook.com/apps/1078817644484423/settings/basic/)
zurücksetzen.
