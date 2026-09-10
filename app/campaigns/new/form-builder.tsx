"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Banner, Button, IconButton, TextInput } from "@astryxdesign/core";
import { ArrowDownIcon, ArrowSquareOutIcon, ArrowUpIcon, PlusIcon, SparkleIcon, TrashIcon } from "@phosphor-icons/react";
import { Sign } from "@/theme/icons";
import { BRICKS } from "@/lib/form-bricks";
import { buildFormSpec, formSpecBlockers, gotoOf, moveQuestion, removeQuestion, type FormQuestion, type FormSpec, type Goto } from "@/lib/form-spec";
import { instantFormsUrl } from "@/lib/forms";
import { suggestFormAction, type FormSuggestInput } from "../actions";
import styles from "./form-builder.module.css";

type EditorQuestion = FormQuestion & { id: string };
const editable = (q: FormQuestion): EditorQuestion => ({ ...q, id: crypto.randomUUID(), options: [...q.options], goto: { ...q.goto } });

/** Edits stay local; the extension transfers the validated template to Meta for review. */
export function FormBuilder({ input }: { input: Omit<FormSuggestInput, "website"> }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [extension, setExtension] = useState<string | null>();
  useEffect(() => setExtension(document.documentElement.dataset.moFormExt ?? null), []);
  const [spec, setSpec] = useState<FormSpec>();
  const [questions, setQuestions] = useState<EditorQuestion[]>([]);
  const [website, setWebsite] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<{ ok: boolean; error?: string }>();
  const [preview, setPreview] = useState(false);
  const [replace, setReplace] = useState(false);
  const [undo, setUndo] = useState<EditorQuestion[]>();
  const [announcement, setAnnouncement] = useState("");
  const [dragged, setDragged] = useState<string>();
  const [dropIndex, setDropIndex] = useState<number>();

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === window && e.data?.type === "mo_form:opened") setOpened({ ok: e.data.ok, error: e.data.error });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const url = instantFormsUrl(input.pageId);
  if (extension === undefined) return null;
  if (extension === null) return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" icon={<ArrowSquareOutIcon size={16} />} label="Formular in Meta erstellen" href={url} target="_blank" />
      <span>Zurück hier wird das neue Formular erkannt und gewählt.</span>
    </div>
  );

  const suggest = async () => {
    setBusy(true);
    setReplace(false);
    setError(undefined);
    setOpened(undefined);
    try {
      const res = await suggestFormAction({ ...input, website });
      setWarnings(res.warnings);
      setError(res.error);
      if (res.spec) {
        setSpec(res.spec);
        setQuestions(res.spec.questions.map(editable));
        setWebsite(res.spec.website);
        setUndo(undefined);
        setPreview(false);
        setAnnouncement("Vorlage erstellt. Du kannst jetzt Fragen und Antwortziele bearbeiten.");
      }
    } catch {
      setError("Die Vorlage konnte nicht geladen werden. Bitte versuche es erneut. Deine bisherigen Fragen bleiben erhalten.");
    } finally {
      setBusy(false);
    }
  };

  const current = spec ? buildFormSpec({
    business: input.business, roles: input.roles, roleFreeText: input.roleFreeText,
    version: Number(spec.name.match(/ v(\d+)/)?.[1] ?? 1), initials: input.initials,
    city: input.city, questions, privacyUrl: spec.privacyUrl, website,
  }) : undefined;
  // Validate raw editor values: the export removes incomplete questions.
  const blockers = current ? formSpecBlockers({ ...current, questions }) : [];
  const build = () => {
    if (!current || blockers.length || busy) return;
    setOpened(undefined);
    window.postMessage({ type: "mo_form:build", url, spec: JSON.stringify(current) }, window.location.origin);
  };
  const change = (next: EditorQuestion[]) => {
    setQuestions(next);
    setUndo(undefined);
    setOpened(undefined);
  };
  const update = (i: number, patch: Partial<FormQuestion>) => change(questions.map((q, j) => j === i ? { ...q, ...patch } : q));
  const setOption = (i: number, k: number, text: string) => {
    const q = questions[i];
    const old = q.options[k];
    const goto = { ...q.goto };
    if (old in goto) {
      const target = goto[old];
      delete goto[old];
      goto[text] = target;
    }
    update(i, { options: q.options.map((o, m) => m === k ? text : o), goto });
  };
  const setGoto = (i: number, option: string, value: string) => {
    const goto = { ...questions[i].goto };
    if (value === "next") delete goto[option];
    else goto[option] = /^\d+$/.test(value) ? Number(value) : value as Goto;
    update(i, { goto });
  };
  const removeOption = (i: number, k: number) => {
    const q = questions[i];
    const goto = { ...q.goto };
    delete goto[q.options[k]];
    update(i, { options: q.options.filter((_, m) => m !== k), goto });
  };
  const focusQuestion = (key: string) => requestAnimationFrame(() => {
    root.current?.querySelector<HTMLTextAreaElement>(`[data-question="${key}"]`)?.focus();
  });
  const addQuestion = (q: FormQuestion = { label: "", options: ["Ja", "Nein"], goto: { Nein: "nolead" } }) => {
    if (questions.length >= 6) return;
    const added = editable(q);
    change([...questions, added]);
    focusQuestion(added.id);
    setAnnouncement(`Frage ${questions.length + 1} hinzugefügt.`);
  };
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= questions.length) return;
    change(moveQuestion(questions, from, to - from));
    setAnnouncement(`Frage ${from + 1} an Position ${to + 1} verschoben. Explizite Sprungziele wurden mitgenommen. Bitte prüfe die Reihenfolge.`);
  };
  const remove = (i: number) => {
    const before = questions;
    change(removeQuestion(questions, i));
    setUndo(before);
    setAnnouncement(`Frage ${i + 1} entfernt. Verweise darauf führen jetzt zur nächsten Frage.`);
    const next = questions[i + 1] ?? questions[i - 1];
    if (next) focusQuestion(next.id);
  };
  const targetLabel = (i: number, target: Goto) => {
    if (target === "nolead") return "Kein Lead · Formular schließen";
    if (target === "lead") return "Lead · weiter zu den Kontaktdaten";
    const index = target === "next" ? i + 1 : target - 1;
    return index === questions.length ? "Weiter zur Erreichbarkeit" : `Frage ${index + 1}: ${questions[index]?.label || "Ohne Fragetext"}`;
  };

  return (
    <div ref={root} className={styles.builder}>
      <div className={styles.header}>
        <div>
          <h3>Lead-Formular gestalten</h3>
          <p>{current ? `${current.name} · ${input.business}` : "Starte mit einem Vorschlag und passe Fragen und Antwortwege an."}</p>
        </div>
        {current && <Button variant="secondary" size="sm" icon={<Sign meaning={preview ? "edit" : "preview"} />} label={preview ? "Weiter bearbeiten" : "Ablauf testen"} onClick={() => setPreview(!preview)} isDisabled={busy || (!preview && blockers.length > 0)} />}
      </div>
      <div className="sr-only" role="status">{announcement}</div>
      {error && <Banner status="error" title="Vorlage nicht erstellt" description={error} />}
      {opened?.ok && <Banner status="info" title="Baukasten geöffnet" description="Die Erweiterung baut im neuen Tab. Prüfe dort und klicke „Formular erstellen“. Zurück hier wird es erkannt." />}
      {opened && !opened.ok && <Banner status="error" title="Baukasten nicht geöffnet" description={opened.error ?? "Bitte lade die Seite neu und versuche es erneut."} />}

      {!current && <div className={styles.empty}>
        <h4>Die passenden Fragen als Ausgangspunkt</h4>
        <p>Die KI nutzt die Angaben zur Stelle. Du bestimmst anschließend, welche Antwort zur nächsten Frage oder zum Ende führt.</p>
        <Button variant="secondary" icon={<SparkleIcon size={18} />} label={busy ? "Vorlage wird erstellt…" : "Vorlage vorschlagen"} onClick={suggest} isDisabled={busy} />
      </div>}

      {current && (preview ? <FormPreview spec={current} /> : <fieldset className={styles.editor} disabled={busy} aria-busy={busy}>
        <div className={styles.intro}>
          <span className={styles.step}>Start</span>
          <div><h4>{current.intro.title}</h4><p>{current.intro.description}</p></div>
        </div>
        <div className={styles.sectionHeading}>
          <div><h4>Fragen & Antwortwege</h4><p>Fragen am Griff ziehen oder mit den Pfeilen verschieben. Jede Antwort hat ein Ziel.</p></div>
          <span className={styles.count}>{questions.length} / 6 Fragen</span>
        </div>
        <ol className={styles.questions} aria-label="Fragen in Reihenfolge">
          {questions.map((q, i) => {
            const issues = blockers.filter(b => b.startsWith(`F${i + 1}:`));
            return <li key={q.id} className={styles.question} data-dragging={dragged === q.id || undefined} data-drop={dropIndex === i || undefined}
              onDragOver={e => { if (dragged && !busy) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropIndex(i); } }}
              onDrop={e => { e.preventDefault(); if (dragged && !busy) move(questions.findIndex(item => item.id === dragged), i); setDragged(undefined); setDropIndex(undefined); }}>
              {dropIndex === i && dragged !== q.id && <span className={styles.dropLabel}>Hierhin verschieben</span>}
              <div className={styles.questionHeader}>
                <button type="button" className={styles.grip} draggable={!busy} aria-label={`Frage ${i + 1} verschieben`} title="Ziehen oder Alt + Pfeil nach oben / unten"
                  onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", q.id); setDragged(q.id); }}
                  onDragEnd={() => { setDragged(undefined); setDropIndex(undefined); }}
                  onKeyDown={e => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); move(i, i + (e.key === "ArrowUp" ? -1 : 1)); } }}>
                  <Sign meaning="reorder" size={20} />
                </button>
                <label className={styles.questionLabel} htmlFor={`${id}-${q.id}`}>Frage {i + 1}</label>
                <div className={styles.tools}>
                  <IconButton variant="ghost" size="sm" label={`Frage ${i + 1} nach oben`} icon={<ArrowUpIcon size={16} />} isDisabled={busy || i === 0} onClick={() => move(i, i - 1)} />
                  <IconButton variant="ghost" size="sm" label={`Frage ${i + 1} nach unten`} icon={<ArrowDownIcon size={16} />} isDisabled={busy || i === questions.length - 1} onClick={() => move(i, i + 1)} />
                  <IconButton variant="ghost" size="sm" label={`Frage ${i + 1} entfernen`} icon={<TrashIcon size={16} />} isDisabled={busy} onClick={() => remove(i)} />
                </div>
              </div>
              <textarea id={`${id}-${q.id}`} data-question={q.id} className={styles.questionInput} value={q.label} onChange={e => update(i, { label: e.target.value })} placeholder="Was möchtest du wissen?" rows={2} aria-invalid={!q.label.trim()} aria-describedby={issues.length ? `${id}-${q.id}-issues` : undefined} />
              <ul className={styles.answers}>
                {q.options.map((o, k) => {
                  const target = gotoOf(q, o);
                  const invalid = typeof target === "number" && (target <= i + 1 || target > questions.length);
                  return <li key={k} className={styles.answer}>
                    <div className={styles.answerText}><TextInput label={`Antwort ${k + 1}`} value={o} onChange={v => setOption(i, k, v)} placeholder="Antwort eingeben" width="100%" isDisabled={busy} /></div>
                    <div className={styles.destination}>
                      <label htmlFor={`${id}-${q.id}-target-${k}`}>Dann weiter zu</label>
                      <select id={`${id}-${q.id}-target-${k}`} value={String(target)} onChange={e => setGoto(i, o, e.target.value)} disabled={!o.trim() || busy} aria-invalid={invalid}>
                        {invalid && <option value={String(target)}>Ungültig: Frage {target} · Ziel ändern</option>}
                        <option value="next">{i + 1 < questions.length ? `Nächste Frage (${i + 2})` : "Erreichbarkeit"}</option>
                        {questions.slice(i + 1).map((later, n) => <option key={later.id} value={String(i + n + 2)}>Frage {i + n + 2}: {later.label || "Ohne Fragetext"}</option>)}
                        <option value="lead">Lead · Kontaktdaten</option>
                        <option value="nolead">Kein Lead · Ende</option>
                      </select>
                      <p className={styles.route} data-end={target === "nolead" ? "excluded" : undefined}>{targetLabel(i, target)}</p>
                    </div>
                    <div className={styles.answerRemove}><IconButton variant="ghost" size="sm" label={`Antwort ${k + 1} aus Frage ${i + 1} entfernen`} icon={<TrashIcon size={16} />} isDisabled={busy || q.options.length <= 2} onClick={() => removeOption(i, k)} /></div>
                  </li>;
                })}
              </ul>
              <div className={styles.answerFooter}>
                <Button variant="ghost" size="sm" icon={<PlusIcon size={16} />} label="Antwort hinzufügen" isDisabled={busy || q.options.length >= 4} onClick={() => update(i, { options: [...q.options, ""] })} />
                <span>2–4 Antworten</span>
              </div>
              {issues.length > 0 && <ul id={`${id}-${q.id}-issues`} className={styles.issues}>{issues.map(issue => <li key={issue}>{issue.replace(/^F\d+: /, "")}</li>)}</ul>}
            </li>;
          })}
        </ol>
        {undo && <div className={styles.undo}><span>Frage entfernt. Verweise darauf führen zur nächsten Frage.</span><Button variant="secondary" size="sm" label="Rückgängig" onClick={() => { change(undo); setAnnouncement("Frage und Antwortwege wiederhergestellt."); }} /></div>}
        <div className={styles.addRow}><Button variant="secondary" icon={<PlusIcon size={16} />} label="Eigene Frage hinzufügen" onClick={() => addQuestion()} isDisabled={busy || questions.length >= 6} /><span>{questions.length >= 6 ? "Alle 6 Frageplätze sind belegt." : "Oder nutze eine fertige Frage aus den Bausteinen."}</span></div>
        <details className={styles.details}>
          <summary>Fragenbausteine <span>{BRICKS.length} Vorlagen</span></summary>
          <div className={styles.bricks}>{BRICKS.map(b => {
            const used = questions.some(q => q.label.trim().toLowerCase() === b.question.label.toLowerCase());
            return <button type="button" key={b.question.label} disabled={busy || used || questions.length >= 6} onClick={() => addQuestion(b.question)}><span>{b.question.label}</span><span>{used ? "Hinzugefügt" : "+ Hinzufügen"}</span></button>;
          })}</div>
        </details>
        <div className={styles.fixed}>
          <div><span className={styles.step}>Danach</span><h4>Erreichbarkeit & Kontakt</h4><p>{current.freeText[0]}</p><p>{current.contact.headline}</p><p>Name, Telefon und E-Mail · werden bei einem Lead abgefragt.</p></div>
          <div><span className={styles.step}>Zwei Ausgänge</span><h4>Lead oder kein Lead</h4><p><strong>Lead:</strong> Kontaktdaten erfassen und Bewerbung senden.</p><p><strong>Kein Lead:</strong> Ohne Kontaktdaten beenden und zur Website verweisen.</p></div>
        </div>
        <details className={styles.details}>
          <summary>Abschluss & Datenschutz ansehen</summary>
          <div className={styles.endingDetails}><h4>Lead · {current.endings.lead.title}</h4><p>{current.endings.lead.description}</p><h4>Kein Lead · {current.endings.nonLead.title}</h4><p>{current.endings.nonLead.description}</p><h4>{current.privacyLinkText}</h4><p>{current.privacyUrl || "Website unten ergänzen."}</p></div>
        </details>
        <div className={styles.website}><TextInput label="Website des Kunden" value={website} onChange={v => { setWebsite(v); setOpened(undefined); }} width="100%" placeholder="https://…" isDisabled={busy} /><p>Ziel des Buttons „Website ansehen“ auf beiden Abschlussseiten.</p></div>
      </fieldset>)}
      {warnings.length > 0 && <Banner status="warning" title="Hinweise zur Vorlage" description={<ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul>} />}
      {current && blockers.length > 0 && <Banner status="warning" title={`${blockers.length} ${blockers.length === 1 ? "Punkt" : "Punkte"} vor dem Testen und Übertragen klären`} description={<ul>{blockers.map(b => <li key={b}>{b}</li>)}</ul>} />}
      {current && <div className={styles.footer}>
        {replace ? <div className={styles.replace}><p>Ein neuer Vorschlag ersetzt deine Fragen und Antwortwege.</p><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" label="Fragen ersetzen" onClick={suggest} /><Button variant="ghost" size="sm" label="Behalten" onClick={() => setReplace(false)} /></div></div> : <Button variant="ghost" size="sm" icon={<SparkleIcon size={16} />} label={busy ? "Vorlage wird erstellt…" : "Neu vorschlagen"} onClick={() => setReplace(true)} isDisabled={busy} />}
        <div className={styles.publish}><p>In Meta prüfen und mit „Formular erstellen“ abschließen.</p><Button variant="primary" label="In Meta bauen" onClick={build} isDisabled={busy || blockers.length > 0} /></div>
      </div>}
    </div>
  );
}

function FormPreview({ spec }: { spec: FormSpec }) {
  const [path, setPath] = useState<(number | "contact" | "lead" | "nolead")[]>([0]);
  const step = path[path.length - 1];
  const question = typeof step === "number" ? spec.questions[step] : undefined;
  const next = (target: Goto) => {
    const index = typeof step === "number" ? step : 0;
    setPath([...path, target === "nolead" ? "nolead" : target === "lead" ? "contact" : target === "next" ? index + 1 : target - 1]);
  };
  return <section className={styles.preview} aria-label="Formular testen">
    <div className={styles.previewHeading}><h4>Ablauf testen</h4><span>Vorschau · es werden keine Daten gesendet</span></div>
    <div className={styles.previewCard} aria-live="polite" aria-atomic="true">
      {question ? <><p>Frage {Number(step) + 1}</p><h3>{question.label}</h3><div className={styles.previewOptions}>{question.options.map(option => <Button key={option} variant="secondary" label={option} onClick={() => next(gotoOf(question, option))} />)}</div></> :
        step === "lead" || step === "nolead" ? <><p>{step === "lead" ? "Ergebnis: Lead" : "Ergebnis: Kein Lead"}</p><h3>{spec.endings[step === "lead" ? "lead" : "nonLead"].title}</h3><p className={styles.previewCopy}>{spec.endings[step === "lead" ? "lead" : "nonLead"].description}</p><p>„Website ansehen“ führt zu {spec.website}</p></> :
        step === "contact" ? <><h3>{spec.contact.headline}</h3><p>Hier geben Bewerber Name, Telefonnummer und E-Mail-Adresse an und bestätigen den Datenschutz.</p><Button variant="primary" label="Bewerbung senden (Test)" onClick={() => setPath([...path, "lead"])} /></> :
        <><h3>{spec.freeText[0]}</h3><p>Hier können Bewerber ihre gewünschte Rückrufzeit frei angeben.</p><Button variant="secondary" label="Weiter zu den Kontaktdaten" onClick={() => setPath([...path, "contact"])} /></>}
    </div>
    <div className={styles.previewNavigation}><Button variant="ghost" label="Zurück" isDisabled={path.length === 1} onClick={() => setPath(path.slice(0, -1))} /><Button variant="secondary" label="Neu starten" onClick={() => setPath([0])} /></div>
  </section>;
}
