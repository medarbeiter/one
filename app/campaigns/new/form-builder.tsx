"use client";

import { useEffect, useState } from "react";
import { Badge, Banner, Button, IconButton, Text, TextInput, ToggleButton } from "@astryxdesign/core";
import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  PlusIcon,
  ProhibitIcon,
  SparkleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { buildFormSpec, formSpecBlockers, type FormQuestion, type FormSpec } from "@/lib/form-spec";
import { instantFormsUrl } from "@/lib/forms";
import { suggestFormAction, type FormSuggestInput } from "../actions";

/**
 * Der Editor für ein neues Lead-Formular: die KI schlägt die Fragen vor, der
 * Rest ist Regel (lib/form-spec.ts). Jede Antwort ist entweder „weiter“ oder
 * „Kein Lead“ – das ist die bedingte Logik, die Meta nur im Baukasten kennt.
 * „In Meta bauen“ reicht die Vorlage an die Erweiterung (extension/), die den
 * Baukasten tippt. Ohne Erweiterung gibt es keinen Editor, nur den Link in den
 * Baukasten: eine Vorlage, die niemand abtippt, wäre bloß Lesestoff.
 * Gespeichert oder veröffentlicht wird nie; zurück hier erkennt newlyAppeared()
 * das neue Formular.
 */
export function FormBuilder({ input }: { input: Omit<FormSuggestInput, "website"> }) {
  // bridge.js setzt das Attribut bei document_start; erst nach dem Hydrieren
  // lesen, sonst passt der Server-Text nicht zum Client. undefined = noch
  // nicht nachgesehen, null = keine Erweiterung.
  const [extension, setExtension] = useState<string | null>();
  useEffect(() => setExtension(document.documentElement.dataset.moFormExt ?? null), []);

  const [spec, setSpec] = useState<FormSpec>();
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [website, setWebsite] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
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

  const suggest = async () => {
    setBusy(true);
    setError(undefined);
    setOpened(undefined);
    const res = await suggestFormAction({ ...input, website });
    setWarnings(res.warnings);
    setError(res.error);
    if (res.spec) {
      setSpec(res.spec);
      setQuestions(res.spec.questions);
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
        questions,
        privacyUrl: spec.privacyUrl,
        website,
      })
    : undefined;
  // Blocker auf den rohen Fragen: buildFormSpec() lässt unfertige still weg.
  const blockers = current ? formSpecBlockers({ ...current, questions }) : [];

  const build = () => {
    if (!current) return;
    setOpened(undefined);
    window.postMessage({ type: "mo_form:build", url, spec: JSON.stringify(current) }, window.location.origin);
  };

  const update = (i: number, patch: Partial<FormQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, dir: -1 | 1) =>
    setQuestions((qs) => {
      const next = [...qs];
      const [q] = next.splice(i, 1);
      next.splice(i + dir, 0, q);
      return next;
    });
  const setOption = (i: number, k: number, text: string) => {
    const q = questions[i];
    const old = q.options[k];
    update(i, {
      options: q.options.map((o, m) => (m === k ? text : o)),
      disqualify: q.disqualify.map((d) => (d === old ? text : d)),
    });
  };
  const toggleNoLead = (i: number, option: string) => {
    const q = questions[i];
    update(i, {
      disqualify: q.disqualify.includes(option) ? q.disqualify.filter((d) => d !== option) : [...q.disqualify, option],
    });
  };
  const removeOption = (i: number, k: number) => {
    const q = questions[i];
    update(i, { options: q.options.filter((_, m) => m !== k), disqualify: q.disqualify.filter((d) => d !== q.options[k]) });
  };
  const addQuestion = () => setQuestions((qs) => [...qs, { label: "", options: ["Ja", "Nein"], disqualify: ["Nein"] }]);

  const reachIndex = questions.length + 1;

  return (
    <div className="w-full space-y-3 rounded-md border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<SparkleIcon size={16} weight="fill" />}
          label={busy ? "Vorlage entsteht…" : spec ? "Neu vorschlagen" : "Vorlage vorschlagen"}
          onClick={suggest}
          isDisabled={busy}
        />
        {current && (
          <Button variant="primary" size="sm" label="In Meta bauen" onClick={build} isDisabled={blockers.length > 0} />
        )}
        <Text type="supporting" as="span">
          {current
            ? `Erweiterung v${extension} öffnet den Baukasten und baut bis zur Prüfung – „Formular erstellen“ klickst du.`
            : "Die KI schlägt die Qualifizierungsfragen vor, alles andere steht nach Vorlage fest."}
        </Text>
      </div>

      {error && <Banner status="error" title="Vorlage nicht erstellt" description={error} />}
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

      {current && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Text type="supporting" as="span">
              {current.name}
            </Text>
            <Text type="supporting" as="span">
              · {current.intro.title}
            </Text>
          </div>

          <ol className="space-y-2">
            {questions.map((q, i) => (
              <li key={i} className="space-y-2 rounded-md border border-neutral-200 bg-white p-2">
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" label={`F${i + 1}`} />
                  <div className="min-w-0 flex-1">
                    <TextInput
                      label={`Frage ${i + 1}`}
                      isLabelHidden
                      value={q.label}
                      onChange={(v) => update(i, { label: v })}
                      placeholder="Frage"
                      size="sm"
                      width="100%"
                    />
                  </div>
                  <IconButton variant="ghost" size="sm" label="Nach oben" icon={<ArrowUpIcon size={16} />} isDisabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label="Nach unten"
                    icon={<ArrowDownIcon size={16} />}
                    isDisabled={i === questions.length - 1}
                    onClick={() => move(i, 1)}
                  />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label="Frage entfernen"
                    icon={<TrashIcon size={16} />}
                    onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                  />
                </div>
                <ul className="space-y-1 pl-10">
                  {q.options.map((o, k) => {
                    const noLead = q.disqualify.includes(o);
                    return (
                      <li key={k} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <TextInput
                            label={`Antwort ${k + 1}`}
                            isLabelHidden
                            value={o}
                            onChange={(v) => setOption(i, k, v)}
                            placeholder="Antwort"
                            size="sm"
                            width="100%"
                          />
                        </div>
                        <Text type="supporting" as="span" className="w-28 text-right tabular-nums">
                          {noLead ? "→ Kein Lead (E2)" : `→ F${i + 2}`}
                        </Text>
                        <ToggleButton
                          size="sm"
                          label="Kein Lead"
                          icon={<ProhibitIcon size={14} />}
                          isPressed={noLead}
                          onPressedChange={() => toggleNoLead(i, o)}
                          isDisabled={!o.trim()}
                        />
                        <IconButton
                          variant="ghost"
                          size="sm"
                          label="Antwort entfernen"
                          icon={<TrashIcon size={14} />}
                          isDisabled={q.options.length <= 2}
                          onClick={() => removeOption(i, k)}
                        />
                      </li>
                    );
                  })}
                  <li>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<PlusIcon size={14} />}
                      label="Antwort"
                      isDisabled={q.options.length >= 4}
                      onClick={() => update(i, { options: [...q.options, ""] })}
                    />
                  </li>
                </ul>
              </li>
            ))}
          </ol>
          <Button variant="ghost" size="sm" icon={<PlusIcon size={14} />} label="Frage" onClick={addQuestion} isDisabled={questions.length >= 6} />

          {/* Was fest ist, steht sichtbar – nur nicht editierbar. */}
          <div className="space-y-1 rounded-md bg-neutral-50 p-2">
            <Text type="supporting" as="p">
              F{reachIndex} {current.freeText[0]} · Freitext → Formular senden (E1)
            </Text>
            <Text type="supporting" as="p">
              Kontakt: {current.contact.headline} · Name, Telefon, E-Mail
            </Text>
            <Text type="supporting" as="p">
              Datenschutz: {current.privacyLinkText} → {current.privacyUrl || "–"}
            </Text>
            <Text type="supporting" as="p">
              E1 Lead: {current.endings.lead.title} · E2 Kein Lead: {current.endings.nonLead.title} → Website
            </Text>
          </div>

          <TextInput label="Website" value={website} onChange={setWebsite} width="100%" className="max-w-xl" placeholder="https://…" />

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
