# Formular bauen – Chrome-Erweiterung

Tippt die Vorlage aus `/campaigns/new` („In Meta bauen“) im Meta-Baukasten ab. Warum
kein API-Aufruf: `docs/superpowers/specs/2026-08-16-lead-form-creation-design.md` §8.

## Installieren

1. `chrome://extensions` → „Entwicklermodus“ an → „Entpackte Erweiterung laden“ → diesen Ordner wählen.
2. In Meta Business Suite auf der Kundenseite angemeldet sein.
3. Im Assistenten unter „Lead-Formular“: **Vorlage vorschlagen** → prüfen → **In Meta bauen**.

Die Vorlage reist im URL-Hash (`#mo_form=…`), `capture.js` liest ihn vor der SPA. Über das
Popup lässt sich die JSON auch einfügen oder die letzte Vorlage erneut starten.

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
