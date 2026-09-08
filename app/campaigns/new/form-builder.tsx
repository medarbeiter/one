"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Text, TextArea, TextInput } from "@astryxdesign/core";
import { SparkleIcon } from "@phosphor-icons/react";
import {
  buildFormSpec,
  encodeSpec,
  formSpecBlockers,
  parseQuestionLines,
  questionLines,
  type FormSpec,
} from "@/lib/form-spec";
import { instantFormsUrl } from "@/lib/forms";
import { suggestFormAction, type FormSuggestInput } from "../actions";

/**
 * Die Vorlage für ein neues Lead-Formular: die KI schlägt die Fragen vor, der
 * Rest ist Regel (lib/form-spec.ts). „In Meta bauen" öffnet den Baukasten mit
 * der Vorlage im URL-Hash – die Erweiterung (extension/) tippt sie dort ab.
 * Gespeichert oder veröffentlicht wird nichts; der letzte Klick bleibt beim
 * Menschen, und zurück hier erkennt newlyAppeared() das neue Formular.
 */
export function FormBuilder({ input }: { input: Omit<FormSuggestInput, "website"> }) {
  const [spec, setSpec] = useState<FormSpec>();
  const [lines, setLines] = useState("");
  const [website, setWebsite] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const suggest = async () => {
    setBusy(true);
    setError(undefined);
    const res = await suggestFormAction({ ...input, website });
    setWarnings(res.warnings);
    setError(res.error);
    if (res.spec) {
      setSpec(res.spec);
      setLines(questionLines(res.spec.questions));
      setWebsite(res.spec.website);
    }
    setBusy(false);
  };

  // Die Vorlage folgt den Feldern – was hier steht, geht so in den Baukasten.
  const current = spec
    ? buildFormSpec({
        business: input.business,
        roles: input.roles,
        roleFreeText: input.roleFreeText,
        version: Number(spec.name.match(/ v(\d+)/)?.[1] ?? 1),
        initials: input.initials,
        city: input.city,
        questions: parseQuestionLines(lines),
        privacyUrl: spec.privacyUrl,
        website,
      })
    : undefined;
  const blockers = current ? formSpecBlockers(current) : [];

  // Mit Erweiterung: die Vorlage geht direkt an sie (bridge.js), sie öffnet
  // den Baukasten und legt los. Ohne: der Hash-Weg, der die Erweiterung
  // ebenfalls startet, falls sie doch da ist – sonst bleibt es der Baukasten.
  // bridge.js setzt das Attribut bei document_start; erst nach dem Hydrieren
  // lesen, sonst passt der Server-Text nicht zum Client.
  const [extension, setExtension] = useState<string>();
  useEffect(() => setExtension(document.documentElement.dataset.moFormExt), []);
  const build = () => {
    if (!current) return;
    const url = instantFormsUrl(input.pageId);
    if (extension) {
      window.postMessage({ type: "mo_form:build", url, spec: JSON.stringify(current) }, window.location.origin);
      return;
    }
    window.open(`${url}#mo_form=${encodeSpec(current)}`, "_blank");
  };

  return (
    <div className="w-full space-y-3 rounded-md border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<SparkleIcon size={16} weight="fill" />}
          label={busy ? "Vorlage entsteht…" : spec ? "Neu vorschlagen" : "Vorlage vorschlagen"}
          onClick={suggest}
          isDisabled={busy || !input.pageId}
        />
        {current && (
          <Button
            variant="primary"
            size="sm"
            label="In Meta bauen"
            onClick={build}
            isDisabled={blockers.length > 0}
          />
        )}
        <Text type="supporting" as="span">
          {extension
            ? `Fragen von der KI, alles andere nach Vorlage. Die Erweiterung (v${extension}) öffnet den Baukasten und baut das Formular bis zur Prüfung.`
            : "Chrome-Erweiterung nicht gefunden – extension/ unter chrome://extensions laden, dann diese Seite neu laden."}
        </Text>
      </div>

      {error && <Banner status="error" title="Vorlage nicht erstellt" description={error} />}

      {current && (
        <>
          <Text type="supporting" as="p">
            Name: {current.name}
          </Text>
          <TextArea
            label="Fragen"
            description="Eine je Zeile: Frage | Antwort, Antwort* – das Sternchen führt zur Nicht-Lead-Seite. Erreichbarkeit und Kontakt kommen fest dazu."
            value={lines}
            onChange={setLines}
            rows={Math.max(3, lines.split("\n").length + 1)}
            width="100%"
            className="max-w-xl"
          />
          <TextInput
            label="Website"
            description={`Datenschutz: ${current.privacyUrl || "–"}`}
            value={website}
            onChange={setWebsite}
            width="100%"
            className="max-w-xl"
          />
          {[...warnings, ...blockers].map((w) => (
            <Text key={w} type="supporting" as="p">
              {w}
            </Text>
          ))}
        </>
      )}
    </div>
  );
}
