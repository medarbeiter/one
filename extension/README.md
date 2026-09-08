# Formular bauen – Chrome-Erweiterung

Tippt die Vorlage aus `/campaigns/new` („In Meta bauen“) im Meta-Baukasten ab. Warum
kein API-Aufruf: `docs/superpowers/specs/2026-08-16-lead-form-creation-design.md` §8.

## Installieren

1. `chrome://extensions` → „Entwicklermodus“ an → „Entpackte Erweiterung laden“ → diesen Ordner wählen.
2. In Meta Business Suite auf der Kundenseite angemeldet sein.
3. `/campaigns/new` neu laden – unter „Lead-Formular“ steht dann „Die Erweiterung (v…) öffnet den Baukasten“.
4. **Vorlage vorschlagen** → Fragen und „Kein Lead“-Antworten im Editor prüfen → **In Meta bauen**. Ein neuer Tab geht auf, die Erweiterung
   baut bis zur Prüfung; „Formular erstellen“ klickt der Mensch.

`bridge.js` läuft auf der App (localhost, *.med-arbeiter.de, *.medarbeiter.de – andere
Domain in `manifest.json` ergänzen) und reicht die Vorlage an `background.js`, der sie in
`chrome.storage.session` legt und den Baukasten öffnet. Ohne Erweiterung zeigt die App
keinen Editor, nur den Link in den Baukasten. `capture.js` liest zusätzlich einen
`#mo_form=`-Hash, falls jemand eine Vorlage von Hand per URL übergibt. Das Popup ist nur
zum Wiederholen oder für eine von Hand eingefügte Vorlage als JSON.

## Kalibrieren

Der Baukasten hat keine stabilen Selektoren; gefunden wird über sichtbaren Text,
Platzhalter und aria-Beschriftungen. Alle stehen in `T` am Anfang von `content.js`,
abgelesen am echten Baukasten (2026-09-08). Hält ein Schritt an, nennt das Overlay unten
rechts die fehlende Beschriftung: im Baukasten nachsehen, wie sie wirklich heißt, in `T`
ergänzen, Erweiterung neu laden, Popup → „Erneut“.

Was der Baukasten tatsächlich tut (deshalb die Reihenfolge im Skript):

- Sprache zuerst: die Kontaktfelder heißen je nach Formularsprache „Email“/„Phone number“
  oder „E-Mail-Adresse“/„Telefonnummer“.
- Mit „Bedingte Logik“ hat jede Antwort drei Ziele: „Zu einer Frage“, „Formular senden“
  (E1, Leads) und „Formular schließen“ (E2, Nicht-Leads). Beide Zielseiten existieren dann
  schon; „Zielseite hinzufügen“ ist nicht nötig.
- Fragen werden erst alle angelegt, dann verknüpft – „Zu einer Frage“ listet nur
  vorhandene Fragen.
- E-Mail lässt sich erst löschen, wenn ein zweites Kontaktfeld da ist: also Telefon rein,
  E-Mail raus, E-Mail wieder rein (die Reihenfolge ist die des Hinzufügens).
- Das Feld „Beschreibung“ der Kontaktinformationen ist Pflicht – dort steht die Überschrift
  „Wie können wir dich am besten erreichen?“.

Die Erweiterung speichert und veröffentlicht nie. Zurück im Assistenten wird das neue
Formular erkannt und gewählt.
