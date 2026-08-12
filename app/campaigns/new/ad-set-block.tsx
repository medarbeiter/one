"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  NumberField,
  TextArea,
  TextField,
} from "@heroui/react";
import type { AdSetInput } from "@/lib/launch";
import type { LeadForm } from "@/lib/forms";
import { instantFormsUrl } from "@/lib/forms";
import { listFormsAction } from "../actions";

const field = "border-line bg-surface h-10 w-full rounded-md border px-3 text-sm";

const BODY_LIMIT = 1024;
const TITLE_LIMIT = 255;
const DESCRIPTION_LIMIT = 255;
const MAX_ITEMS = 5;

/**
 * Ein Feld pro Eintrag plus Zähler, Hinzufügen/Entfernen – für bodies und
 * titles identisch bis auf Zeilenzahl und Zeichenlimit, deshalb ein Helfer
 * statt zweimal derselbe Block.
 */
function TextListField({
  label: labelText,
  values,
  limit,
  multiline,
  onChange,
}: {
  label: string;
  values: string[];
  limit: number;
  multiline?: boolean;
  onChange: (values: string[]) => void;
}) {
  const update = (i: number, v: string) =>
    onChange(values.map((val, idx) => (idx === i ? v : val)));
  const add = () => onChange([...values, ""]);
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <Label>
        {labelText} ({values.length}/{MAX_ITEMS})
      </Label>
      {values.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <TextField value={v} onChange={(nv) => update(i, nv)} className="flex-1 space-y-1">
            {multiline ? (
              <TextArea rows={3} maxLength={limit} />
            ) : (
              <Input maxLength={limit} />
            )}
          </TextField>
          <div className="flex flex-col items-end gap-1 pt-1">
            <span className={`text-xs ${v.length > limit ? "text-danger" : "text-ink-500"}`}>
              {v.length}/{limit}
            </span>
            <Button
              variant="outline"
              size="sm"
              onPress={() => remove(i)}
              isDisabled={values.length === 1}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onPress={add} isDisabled={values.length >= MAX_ITEMS}>
        Add
      </Button>
    </div>
  );
}

export function AdSetBlock({
  value,
  index,
  pageId,
  instagramUserId,
  adAccount,
  onChange,
  onRemove,
  canRemove,
}: {
  value: AdSetInput;
  index: number;
  pageId: string;
  instagramUserId?: string;
  adAccount: string;
  onChange: (patch: Partial<AdSetInput>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [formsError, setFormsError] = useState<string>();
  const [formsLoading, setFormsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const refreshForms = async () => {
    setFormsLoading(true);
    const res = await listFormsAction(pageId);
    setForms(res.forms);
    setFormsError(res.error);
    setFormsLoading(false);
  };

  // Beim Öffnen des Blocks direkt laden, nicht erst nach Klick auf Refresh –
  // gerade der Fehlende-Rechte-Fehler soll sofort sichtbar sein.
  useEffect(() => {
    if (pageId) refreshForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Laut Spec nur Bestätigung, keine Auswahl – aber buildCreative() braucht den
  // Wert im State, sonst kommt er nie in der Kampagne an.
  useEffect(() => {
    if (instagramUserId && value.instagramUserId !== instagramUserId) {
      onChange({ instagramUserId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instagramUserId]);

  // Parallel per fetch gegen den Route Handler, bewusst keine Server Action:
  // Next schickt Actions pro Client streng nacheinander, das würde ein Batch
  // UGC-Videos serialisieren, während jedes für sich minutenlang enkodiert.
  async function onFiles(files: FileList) {
    setUploading(true);
    const uploads = [...files].map(async (file) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("adAccount", adAccount);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.error) throw new Error(`${file.name}: ${json.error}`);
      if (json.kind !== "video")
        throw new Error(`${file.name}: only videos are used for ads.`);
      return { videoId: json.id as string, thumbnailUrl: json.thumbnail as string | undefined, fileName: file.name };
    });
    const done = await Promise.allSettled(uploads);
    onChange({
      videos: [
        ...value.videos,
        ...done.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
      ],
    });
    setUploadErrors(done.flatMap((r) => (r.status === "rejected" ? [String(r.reason)] : [])));
    setUploading(false);
  }

  const removeVideo = (i: number) =>
    onChange({ videos: value.videos.filter((_, idx) => idx !== i) });

  return (
    <Card className="space-y-4 p-4">
      <Card.Header className="flex flex-row items-end justify-between gap-2 p-0">
        <Card.Title className="text-base">Location {index + 1}</Card.Title>
        <Button variant="outline" onPress={onRemove} isDisabled={!canRemove}>
          Remove location
        </Button>
      </Card.Header>

      <TextField
        value={value.name}
        onChange={(name) => onChange({ name })}
        isRequired
        className="space-y-1"
      >
        <Label>Ad set / location name</Label>
        <Input />
      </TextField>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          value={value.addressString}
          onChange={(addressString) => onChange({ addressString })}
          isRequired
          className="space-y-1"
        >
          <Label>Address</Label>
          <Input placeholder="Musterstraße 1, 12345 Musterstadt" />
        </TextField>

        <div className="space-y-1">
          <Label>Radius</Label>
          <div className="flex items-center gap-2">
            <NumberField
              aria-label="Radius in km"
              value={value.radiusKm}
              onChange={(radiusKm) => onChange({ radiusKm })}
              minValue={1}
              maxValue={80}
              step={1}
            >
              <NumberField.Group>
                <NumberField.Input />
              </NumberField.Group>
            </NumberField>
            <span className="text-ink-500 text-sm">km</span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Lead form</Label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => window.open(instantFormsUrl(pageId), "_blank")}
            >
              Create form in Meta
            </Button>
            <Button variant="outline" size="sm" onPress={refreshForms} isDisabled={formsLoading}>
              {formsLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
        <select
          className={field}
          value={value.formId}
          onChange={(e) => onChange({ formId: e.target.value })}
        >
          <option value="" disabled>
            {formsLoading ? "Loading…" : "Select a form…"}
          </option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {formsError && (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Title>Could not load lead forms</Alert.Title>
              <Alert.Description>{formsError}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </div>

      {/* Rein informativ – die Auswahl passiert nicht hier, sondern folgt aus der
          Seite des Kunden (siehe wizard.tsx). Fehlt das Instagram-Konto, ist das
          kein Fehler: die Anzeige läuft dann nur über die Facebook-Seite. */}
      <p className="text-ink-500 text-sm">
        {instagramUserId
          ? `Posting as @${instagramUserId} on Instagram`
          : "Facebook page only — no Instagram account connected"}
      </p>

      <div className="space-y-2">
        <Label>Videos</Label>
        <input
          type="file"
          accept="video/*"
          multiple
          disabled={uploading}
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
          className="text-sm"
        />
        {uploading && <p className="text-ink-500 text-sm">Uploading…</p>}
        {value.videos.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {value.videos.map((v, i) => (
              <li key={i} className="border-line w-32 space-y-1 rounded-md border p-2">
                {v.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnailUrl} alt="" className="h-16 w-full rounded object-cover" />
                )}
                <p className="truncate text-xs" title={v.fileName}>
                  {v.fileName}
                </p>
                <Button variant="outline" size="sm" onPress={() => removeVideo(i)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {uploadErrors.length > 0 && (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Title>Some uploads failed</Alert.Title>
              <Alert.Description>{uploadErrors.join(" · ")}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </div>

      <TextListField
        label="Primary texts"
        values={value.bodies}
        limit={BODY_LIMIT}
        multiline
        onChange={(bodies) => onChange({ bodies })}
      />

      <TextListField
        label="Headlines"
        values={value.titles}
        limit={TITLE_LIMIT}
        onChange={(titles) => onChange({ titles })}
      />

      <TextField
        value={value.description}
        onChange={(description) => onChange({ description })}
        className="space-y-1"
      >
        <Label>
          Description ({value.description.length}/{DESCRIPTION_LIMIT})
        </Label>
        <Input maxLength={DESCRIPTION_LIMIT} />
      </TextField>
    </Card>
  );
}
