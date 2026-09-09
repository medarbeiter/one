"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Text } from "@astryxdesign/core";
import { ArrowSquareOutIcon, SparkleIcon } from "@phosphor-icons/react";
import type { FormSpec } from "@/lib/form-spec";
import { instantFormsUrl } from "@/lib/forms";
import type { FormSuggestInput } from "../actions";
import { FormDialog } from "./form-dialog";

/**
 * Der Einstieg zum neuen Lead-Formular: ein Knopf, der den Editor als Dialog
 * öffnet (form-dialog.tsx). „In Meta bauen“ reicht die Vorlage an die
 * Erweiterung (extension/), die den Baukasten tippt. Ohne Erweiterung gibt es
 * keinen Editor, nur den Link in den Baukasten: eine Vorlage, die niemand
 * abtippt, wäre bloß Lesestoff. Gespeichert oder veröffentlicht wird nie;
 * zurück hier erkennt newlyAppeared() das neue Formular.
 */
export function FormBuilder({ input }: { input: Omit<FormSuggestInput, "website"> }) {
  // bridge.js setzt das Attribut bei document_start; erst nach dem Hydrieren
  // lesen, sonst passt der Server-Text nicht zum Client. undefined = noch
  // nicht nachgesehen, null = keine Erweiterung.
  const [extension, setExtension] = useState<string | null>();
  useEffect(() => setExtension(document.documentElement.dataset.moFormExt ?? null), []);

  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState<{ ok: boolean; error?: string }>();

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === window && e.data?.type === "mo_form:opened") setOpened({ ok: e.data.ok, error: e.data.error });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const url = instantFormsUrl(input.pageId);
  if (extension === undefined) return null;
  if (extension === null)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowSquareOutIcon size={16} />}
          label="Formular in Meta erstellen"
          href={url}
          target="_blank"
        />
        <Text type="supporting" as="span">
          Zurück hier wird das neue Formular erkannt und gewählt.
        </Text>
      </div>
    );

  const build = (spec: FormSpec) => {
    setOpened(undefined);
    window.postMessage({ type: "mo_form:build", url, spec: JSON.stringify(spec) }, window.location.origin);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={<SparkleIcon size={16} weight="fill" />} label="Formular erstellen" onClick={() => setOpen(true)} />
        <Text type="supporting" as="span">
          Die KI schlägt die Fragen vor, du prüfst den Ablauf, die Erweiterung baut in Meta.
        </Text>
      </div>
      {opened?.ok && (
        <Banner
          status="info"
          title="Baukasten geöffnet"
          description="Die Erweiterung baut im neuen Tab. Prüfe dort, klicke „Formular erstellen“ – zurück hier wird es erkannt."
        />
      )}
      {opened && !opened.ok && (
        <Banner status="error" title="Baukasten nicht geöffnet" description={opened.error ?? "Erweiterung antwortet nicht – neu laden."} />
      )}
      <FormDialog isOpen={open} onOpenChange={setOpen} input={input} extension={extension} onBuild={build} />
    </div>
  );
}
