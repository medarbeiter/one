# Gemeinsamer Kampagnenkontext für `/campaigns/new`

**Datum:** 2026-09-07  
**Status:** Im Chat freigegeben, vor der Implementierungsplanung  
**Scope:** Brief-Zusammenbau, Kampagnenentwurf, Textgenerierung und die erste Ansicht unter `/campaigns/new`

## Zweck

Eine Kampagne gehört weiterhin genau zu einer ClickUp-Aufgabe. Der Assistent liest die Aufgabe und die Onboarding-Tabelle bisher in getrennten Mistral-Anfragen und entscheidet anschließend mit einer festen Rangfolge, welche Quelle gewinnt. Sobald die Aufgabe eine Stelle nennt, verwirft der Zusammenbau alle Stellen aus dem Onboarding. Zusammenhänge und Widersprüche zwischen beiden Quellen bleiben dadurch unsichtbar.

Der neue Kampagnenkontext sammelt die Erkenntnisse beider Quellen und freie Hinweise der bedienenden Person. Eine abschließende Mistral-Anfrage löst diesen Kontext zu einem Vorschlag auf. Jede spätere Textanfrage erhält denselben aufgelösten Kontext.

## Festgelegte Grenzen

- Eine Kampagne lädt genau die ausgewählte ClickUp-Aufgabe. Andere Aufgaben desselben Kunden werden weder gesucht noch zusammengeführt.
- Die Kundenübersicht in ClickUp geht weiterhin nie an Mistral. Sie kann Passwörter und Kontaktdaten enthalten; `overviewFacts()` liest daraus nur Adresse, Umkreis und offene Stellen.
- Der bestehende Text `notes` im Wizard bleibt die wörtliche Beschreibung der ClickUp-Aufgabe. Freie Hinweise heißen im Code `aiNotes`, damit beides nicht vermischt wird.
- Es kommt keine dauerhafte AI-Session hinzu. Jede Anfrage bleibt zustandslos und erhält ihren vollständigen Eingabekontext.
- Es kommt keine neue Abhängigkeit hinzu.

## Bedienung

Über der Aufgabenliste steht ein mehrzeiliges Feld „Hinweise für die KI“. Es ist optional. Beispiele sind „Nur PFK, keine PDL“, „Budget 40 € pro Tag“ oder „Ton sachlich, nicht verspielt“.

Beim Klick auf „Vorschlag erstellen“ sendet der Browser die Task-ID und die Hinweise als JSON an `/api/brief`. Die Route verwendet `POST`; freie Hinweise stehen damit nicht in URL, Verlauf oder Server-Access-Logs. Ein direkter ClickUp-Link funktioniert wie bisher.

Die Hinweise werden im Entwurf gespeichert. Im Vorschlag bleibt das Feld editierbar. Änderungen wirken bei der nächsten manuellen Neugenerierung von Primärtexten, Überschriften oder Beschreibung sofort, ohne ClickUp und Drive erneut zu lesen. Die automatische erste Generierung verwendet den Stand, mit dem der Brief erstellt wurde.

## Datenmodell und Quellen

Die Quellenleser liefern zunächst Belege und treffen keine abschließende Auswahl:

```ts
type CampaignEvidence = {
  task: {
    id: string;
    name: string;
    description: string;
    rolesText?: string;
    dailyBudgetEuros?: number;
    spendCapEuros?: number;
  };
  onboarding: {
    benefits: string[];
    jobs: string[];
  };
  overview: {
    address?: string;
    rolesText?: string;
    radiusKm?: number;
  };
  aiNotes: string;
};

type Source = "clickup" | "onboarding" | "previous" | "session" | "user";
type Sourced<T> = { value: T; sources: Source[] };
```

Mehrere Quellen bleiben sichtbar. Ein Rollenwert kann zum Beispiel `sources: ["clickup", "onboarding"]` tragen. Alte Entwürfe mit einem einzelnen `source`-Wert werden beim Lesen weiterhin verstanden.

## Zusammenbau

`assembleBrief(taskId, aiNotes, deps, emit)` behält die bisherigen unabhängigen Leser. Die Aufgabenbeschreibung liefert Standort, Formularhinweis, Umkreis und Stellen. Die Onboarding-Tabelle liefert Benefits und Stellen. Beide dürfen einzeln scheitern; Warnungen und Werkstattstatus bleiben erhalten.

Wenn die Leser fertig sind, baut `resolveCampaignContext(evidence)` eine einzige, strukturierte Mistral-Anfrage. Sie erhält nur die ausgewählte Aufgabe, die extrahierten Onboarding-Werte, die erlaubten Fakten aus der Kundenübersicht und `aiNotes`. Die Antwort enthält:

```ts
type ResolvedCampaignContext = {
  roles: string[];
  roleFreeText: string;
  locations: string[];
  formHint?: string;
  radiusKm?: number;
  benefits: string[];
  dailyBudgetEuros?: number;
  spendCapEuros?: number;
  copyInstructions: string;
  sources: Partial<Record<
    "roles" | "locations" | "formHint" | "radiusKm" | "benefits" |
      "dailyBudgetEuros" | "spendCapEuros" | "copyInstructions",
    Source[]
  >>;
};
```

Die Regeln im Prompt sind konkret:

- Freie Hinweise haben bei einem ausdrücklichen Widerspruch Vorrang.
- Die ausgewählte Aufgabe beschreibt den Umfang dieser Kampagne. Das Onboarding erklärt und ergänzt ihn; es ersetzt ihn nicht blind durch alle grundsätzlich möglichen Stellen.
- Vereinbare Angaben dürfen zusammengeführt werden. Widersprüchliche Angaben werden nicht als Vereinigung ausgegeben.
- Budgetwerte ändern sich nur, wenn die Hinweise ausdrücklich einen Betrag als Tagesbudget oder Ausgabenlimit nennen.
- Es werden keine Werte erfunden. Jeder ausgegebene Wert nennt mindestens eine tatsächliche Quelle.
- Stil-, Ton- und Ausschlusswünsche landen zusätzlich in `copyInstructions`.

Die Antwort wird wie die anderen Mistral-Antworten defensiv geparst. Unbekannte Quellen, leere Rollen, nicht positive Geldbeträge und nicht positive Radien werden verworfen. Rollen laufen anschließend durch die bestehenden `rolesFromTitles()`-Regeln.

Scheitert allein die Auflösung, verwendet `assembleBrief` den bisherigen deterministischen Fallback. Die Aufgabe hat dort Vorrang, das Onboarding füllt Lücken. Der Brief bleibt benutzbar und erhält eine Warnung. Fehler eines einzelnen Quellenlesers entfernen nur dessen Belege aus der Auflösung.

## Textgenerierung

`BodiesInput` bekommt `instructions?: string`. Alle fünf Primärtexte, die Überschriften und die Beschreibung erhalten weiterhin dieselben strukturierten Kampagnenfakten und zusätzlich diese Anweisungen. Die einzelnen Requests müssen keine gemeinsame Session teilen, weil jeder Request vollständig ist.

Anweisungen dürfen Stil, Ansprache, Schwerpunkte und Ausschlüsse steuern. Sie dürfen die Sicherheitsregeln der bestehenden Prompts nicht aufheben: keine erfundenen Benefits, Meta-Längenlimits und das verlangte Ausgabeformat gelten weiter.

## Werkstatt und Herkunft

Die Werkstatt bekommt nach den Quellenlesern eine Zeile „Kampagnenkontext“. Währenddessen steht dort „verbindet Aufgabe, Onboarding und Hinweise“. Bei Erfolg nennt die Zeile knapp, welche Quellen in den Vorschlag eingegangen sind. Beim Fallback zeigt sie eine Warnung, ohne den Vorschlag zu blockieren.

`Herkunft` nimmt einen oder mehrere Werte entgegen und zeigt etwa „aus ClickUp + Onboarding“ oder „aus deinem Hinweis“. Bestehende Einzelquellen bleiben unverändert lesbar.

## Speicherung und Kompatibilität

`WizardState` bekommt `aiNotes: string` und `copyInstructions: string`. `initialState()` setzt beide auf `""`; `hydrate()` ergänzt sie bei älteren Entwürfen. Die vorhandenen Storage-Schlüssel müssen deshalb nicht wechseln.

Der Brief-Stream bleibt NDJSON. Nur der Start der Anfrage wechselt von `GET ?task=` zu `POST` mit JSON. Das Ergebnis bleibt `AssembledBrief`, erweitert um `copyInstructions` und mehrfache Quellen. Der Launch-Payload erhält keine Hinweise; Meta bekommt nur die daraus erzeugten und anschließend prüfbaren Kampagnenwerte.

## Fehler und Prüfung

Ein leerer Hinweis ist gültig. Zu lange Hinweise werden am Route-Eingang abgewiesen; das Limit beträgt 4.000 Zeichen. Ungültiges JSON, eine fehlende Task-ID oder ein Hinweis mit falschem Typ ergeben Status 400.

Die kleinsten ausführbaren Prüfungen decken ab:

- genau eine Task-ID pro Brief und kein Laden von Geschwisteraufgaben;
- gemeinsame Auflösung aus Aufgabe und Onboarding;
- ausdrückliche Hinweise überschreiben widersprüchliche Rollen, Orte und Budgets;
- leere Hinweise ändern das bisherige Ergebnis nicht;
- ein Fehler der Auflösung fällt auf die bisherige Rangfolge zurück;
- mehrere Quellen bleiben am Wert erhalten und alte Entwürfe werden geladen;
- `aiNotes` und `copyInstructions` erreichen Primärtexte, Überschriften und Beschreibung;
- die Brief-Route validiert den JSON-Body und streamt das Ergebnis.

