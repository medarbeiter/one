"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Banner, Button, Dialog, DialogHeader, IconButton, Layout, LayoutContent, LayoutFooter, TextInput } from "@astryxdesign/core";
import { ArrowDownIcon, ArrowSquareOutIcon, ArrowUpIcon, PaperPlaneRightIcon, PlusIcon, SparkleIcon, TrashIcon } from "@phosphor-icons/react";
import { Sign } from "@/theme/icons";
import { BRICKS, FREE_TEXT_BRICKS } from "@/lib/form-bricks";
import { buildFormSpec, formSpecBlockers, gotoOf, moveQuestion, REACHABILITY, removeQuestion, type FormQuestion, type FormSpec, type Goto } from "@/lib/form-spec";
import { instantFormsUrl, type LeadForm } from "@/lib/forms";
import type { ChatTurn } from "@/lib/form-chat";
import { chatFormAction, importFormAction, suggestFormAction, type FormSuggestInput } from "../actions";
import styles from "./form-builder.module.css";

type EditorQuestion = FormQuestion & { id: string };
type EditorFreeText = { id: string; label: string };
const editable = (q: FormQuestion): EditorQuestion => ({ ...q, id: crypto.randomUUID(), options: [...q.options], goto: { ...q.goto } });

/**
 * Edits stay local; the extension transfers the validated template to Meta for review.
 *
 * `form` ist das gewählte Formular der Anzeige, falls es eins gibt: dann öffnet
 * der Baukasten mit dessen Fragen statt mit einem KI-Vorschlag. Geändert wird
 * dabei nie das Original – Meta lässt ein veröffentlichtes Formular nicht mehr
 * anfassen –, sondern es entsteht die nächste Version.
 */
export function FormBuilder({ input, form, onBuilt }: {
  input: Omit<FormSuggestInput, "website">;
  form?: LeadForm | null;
  onBuilt?: () => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [extension, setExtension] = useState<string | null>();
  useEffect(() => setExtension(document.documentElement.dataset.moFormExt ?? null), []);
  const [spec, setSpec] = useState<FormSpec>();
  const [questions, setQuestions] = useState<EditorQuestion[]>([]);
  const [freeText, setFreeText] = useState<EditorFreeText[]>([]);
  const [website, setWebsite] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<{ ok: boolean; error?: string }>();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [replace, setReplace] = useState(false);
  const [undo, setUndo] = useState<{ questions: EditorQuestion[]; freeText: EditorFreeText[]; note: string }>();
  /** Aus welchem Formular der Entwurf stammt – für die Überschrift und den „neu laden“-Weg. */
  const [basis, setBasis] = useState<LeadForm>();
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

  /** Ohne `from` ein KI-Vorschlag, mit `from` die Fragen des gewählten Formulars. */
  const load = async (from?: LeadForm | null) => {
    setBusy(true);
    setReplace(false);
    setError(undefined);
    setOpened(undefined);
    try {
      const res = from
        ? await importFormAction({ ...input, website, formId: from.id })
        : await suggestFormAction({ ...input, website });
      setWarnings(res.warnings);
      setError(res.error);
      if (res.spec) {
        setSpec(res.spec);
        setQuestions(res.spec.questions.map(editable));
        setFreeText(res.spec.freeText.filter(t => t !== REACHABILITY).map(label => ({ id: crypto.randomUUID(), label })));
        setWebsite(res.spec.website);
        setBasis(from ?? undefined);
        setUndo(undefined);
        setPreview(false);
        setAnnouncement(from
          ? `Fragen aus „${from.name}“ übernommen. Die Antwortwege fehlen und sind neu zu wählen.`
          : "Vorlage erstellt. Du kannst jetzt Fragen und Antwortziele bearbeiten.");
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
    city: input.city, questions, freeText: freeText.map(t => t.label), privacyUrl: spec.privacyUrl, website,
  }) : undefined;
  // Validate raw editor values: the export removes incomplete questions.
  const blockers = current ? formSpecBlockers({ ...current, questions, freeText: freeText.map(t => t.label) }) : [];
  const build = () => {
    if (!current || blockers.length || busy) return;
    setOpened(undefined);
    window.postMessage({ type: "mo_form:build", url, spec: JSON.stringify(current) }, window.location.origin);
    onBuilt?.();
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
    setUndo({ questions: before, freeText, note: "Frage entfernt. Verweise darauf führen zur nächsten Frage." });
    setAnnouncement(`Frage ${i + 1} entfernt. Verweise darauf führen jetzt zur nächsten Frage.`);
    const next = questions[i + 1] ?? questions[i - 1];
    if (next) focusQuestion(next.id);
  };
  const addFreeText = (label = "") => {
    const added = { id: crypto.randomUUID(), label };
    setFreeText([...freeText, added]);
    setOpened(undefined);
    focusQuestion(added.id);
    setAnnouncement(`Freitextfrage ${freeText.length + 1} hinzugefügt.`);
  };
  const setFree = (next: EditorFreeText[]) => { setFreeText(next); setOpened(undefined); };
  const targetLabel = (i: number, target: Goto) => {
    if (target === "nolead") return "Kein Lead · Formular schließen";
    if (target === "lead") return "Lead · weiter zu den Kontaktdaten";
    const index = target === "next" ? i + 1 : target - 1;
    return index === questions.length ? "Weiter zur Erreichbarkeit" : `Frage ${index + 1}: ${questions[index]?.label || "Ohne Fragetext"}`;
  };

  /**
   * Ein Zug im Gespräch: die KI bekommt den Stand, wie er im Editor steht, und
   * gibt ihn ganz zurück. Ersetzt wird deshalb alles auf einmal – mit einem
   * Rückgängig-Schritt, denn ein Missverständnis kostet sonst die ganze Arbeit.
   */
  const ask = async (message: string, history: ChatTurn[]) => {
    const res = await chatFormAction({
      message,
      history,
      questions: questions.map(({ id: _id, ...q }) => q),
      freeText: freeText.map(t => t.label),
      business: input.business,
      roles: input.roles,
      roleFreeText: input.roleFreeText,
      city: input.city,
    });
    if (res.error) return { error: res.error };
    if (res.questions || res.freeText) {
      setUndo({ questions, freeText, note: "Geändert aus dem Gespräch." });
      setOpened(undefined);
      if (res.questions) setQuestions(res.questions.map(editable));
      if (res.freeText) setFreeText(res.freeText.map(label => ({ id: crypto.randomUUID(), label })));
      setAnnouncement(res.reply);
    }
    return { reply: res.reply };
  };

  const onOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setPreview(false);
      setReplace(false);
      setDragged(undefined);
      setDropIndex(undefined);
    }
  };

  return (
    <>
      <div className={styles.launcher}>
        <Button variant="secondary" size="sm" icon={<Sign meaning="leadForm" />} label={current ? "Formular weiter bearbeiten" : form ? "Formular bearbeiten" : "Formular erstellen"} onClick={() => {
          setOpen(true);
          if (!spec && !busy) void load(form);
        }} />
        <p>{current
          ? "Dein Entwurf bleibt beim Schließen erhalten."
          : form
            ? `Fragen aus „${form.name}“ übernehmen, ändern und als neue Version bauen.`
            : "Fragen und Antwortwege in einem eigenen Fenster gestalten."}</p>
      </div>
      {!open && opened?.ok && <Banner status="info" title="Baukasten geöffnet" description="Prüfe das Formular im Meta-Tab und klicke dort „Formular erstellen“." />}
      {!open && opened && !opened.ok && <Banner status="error" title="Baukasten nicht geöffnet" description={opened.error ?? "Bitte öffne den Entwurf und versuche es erneut."} />}
      <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="form" width="min(1440px, calc(100vw - 24px))" maxHeight="calc(100dvh - 24px)" padding={0}>
        <Layout ref={root} className={styles.builder} padding={0} style={{ height: "min(900px, calc(100dvh - 24px))" }}
          header={<div className={styles.header}>
            <DialogHeader title="Lead-Formular gestalten" subtitle={[current?.name, basis && `nach „${basis.name}“`, input.business].filter(Boolean).join(" · ")} onOpenChange={onOpenChange} />
            {current && <div className={styles.toolbar}>
              <p>Entwurf · Änderungen bleiben bis zum Verlassen dieser Seite erhalten.</p>
              <Button variant="secondary" size="sm" icon={<Sign meaning={preview ? "edit" : "preview"} />} label={preview ? "Weiter bearbeiten" : "Ablauf testen"} onClick={() => setPreview(!preview)} isDisabled={busy || (!preview && blockers.length > 0)} />
            </div>}
          </div>}
          content={<LayoutContent padding={0} isScrollable={false}>
            <div className={styles.columns}>
            <div className={styles.main}>
      <div className="sr-only" role="status">{announcement}</div>
      {error && <Banner status="error" title="Vorlage nicht erstellt" description={error} />}
      {opened?.ok && <Banner status="info" title="Baukasten geöffnet" description="Die Erweiterung baut im neuen Tab. Prüfe dort und klicke „Formular erstellen“. Zurück hier wird es erkannt." />}
      {opened && !opened.ok && <Banner status="error" title="Baukasten nicht geöffnet" description={opened.error ?? "Bitte lade die Seite neu und versuche es erneut."} />}

      {!current && <div className={styles.empty}>
        <h4>Die passenden Fragen als Ausgangspunkt</h4>
        <p>Die KI nutzt die Angaben zur Stelle. Du bestimmst anschließend, welche Antwort zur nächsten Frage oder zum Ende führt.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<SparkleIcon size={18} />} label={busy ? "Vorlage wird erstellt…" : "Vorlage vorschlagen"} onClick={() => load()} isDisabled={busy} />
          {form && <Button variant="ghost" icon={<Sign meaning="leadForm" />} label={`Fragen aus „${form.name}“ laden`} onClick={() => load(form)} isDisabled={busy} />}
        </div>
      </div>}

      {current && (preview ? <FormPreview spec={current} /> : <fieldset className={styles.editor} disabled={busy} aria-busy={busy}>
        <section className={styles.section} aria-label="Start des Formulars">
          <div className={styles.sectionTitle}><h4>Start des Formulars</h4><span>Fester Inhalt</span></div>
          <div className={styles.readOnly}><h4>{current.intro.title}</h4><p>{current.intro.description}</p></div>
        </section>
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
        {undo && <div className={styles.undo}><span>{undo.note}</span><Button variant="secondary" size="sm" label="Rückgängig" onClick={() => { const back = undo; change(back.questions); setFreeText(back.freeText); setAnnouncement("Fragen und Antwortwege wiederhergestellt."); }} /></div>}
        <div className={styles.addRow}><Button variant="secondary" icon={<PlusIcon size={16} />} label="Eigene Frage hinzufügen" onClick={() => addQuestion()} isDisabled={busy || questions.length >= 6} /><span>{questions.length >= 6 ? "Alle 6 Frageplätze sind belegt." : "Oder nutze eine fertige Frage aus den Bausteinen."}</span></div>
        <details className={styles.details}>
          <summary>Fragenbausteine <span>{BRICKS.length} Vorlagen</span></summary>
          <div className={styles.bricks}>{BRICKS.map(b => {
            const used = questions.some(q => q.label.trim().toLowerCase() === b.question.label.toLowerCase());
            return <button type="button" key={b.question.label} disabled={busy || used || questions.length >= 6} onClick={() => addQuestion(b.question)}><span>{b.question.label}</span><span>{used ? "Hinzugefügt" : "+ Hinzufügen"}</span></button>;
          })}</div>
        </details>
        <div className={styles.sectionHeading}>
          <div><h4>Freitextfragen</h4><p>Kommen nach den Fragen oben, ohne Antwortwege. Die Erreichbarkeit steht immer zuletzt.</p></div>
          <span className={styles.count}>{freeText.length} eigene</span>
        </div>
        <ol className={styles.questions} aria-label="Freitextfragen in Reihenfolge">
          {freeText.map((t, i) => <li key={t.id} className={styles.question}>
            <div className={styles.questionHeader}>
              <label className={styles.questionLabel} htmlFor={`${id}-${t.id}`}>Freitext {i + 1}</label>
              <div className={styles.tools}>
                <IconButton variant="ghost" size="sm" label={`Freitext ${i + 1} nach oben`} icon={<ArrowUpIcon size={16} />} isDisabled={busy || i === 0} onClick={() => setFree(moveFree(freeText, i, i - 1))} />
                <IconButton variant="ghost" size="sm" label={`Freitext ${i + 1} nach unten`} icon={<ArrowDownIcon size={16} />} isDisabled={busy || i === freeText.length - 1} onClick={() => setFree(moveFree(freeText, i, i + 1))} />
                <IconButton variant="ghost" size="sm" label={`Freitext ${i + 1} entfernen`} icon={<TrashIcon size={16} />} isDisabled={busy} onClick={() => setFree(freeText.filter((_, k) => k !== i))} />
              </div>
            </div>
            <textarea id={`${id}-${t.id}`} data-question={t.id} className={styles.questionInput} value={t.label} onChange={e => setFree(freeText.map((x, k) => k === i ? { ...x, label: e.target.value } : x))} placeholder="Was sollen Bewerber frei beantworten?" rows={2} aria-invalid={!t.label.trim()} />
          </li>)}
        </ol>
        <div className={styles.addRow}><Button variant="secondary" icon={<PlusIcon size={16} />} label="Eigene Freitextfrage hinzufügen" onClick={() => addFreeText()} isDisabled={busy} /><span>Oder nutze eine fertige Freitextfrage aus den Bausteinen.</span></div>
        <details className={styles.details}>
          <summary>Freitextbausteine <span>{FREE_TEXT_BRICKS.length} Vorlagen</span></summary>
          <div className={styles.bricks}>{FREE_TEXT_BRICKS.map(b => {
            const used = freeText.some(t => t.label.trim().toLowerCase() === b.toLowerCase());
            return <button type="button" key={b} disabled={busy || used} onClick={() => addFreeText(b)}><span>{b}</span><span>{used ? "Hinzugefügt" : "+ Hinzufügen"}</span></button>;
          })}</div>
        </details>
        <div className={styles.sectionHeading}>
          <div><h4>Kontakt & Abschluss</h4><p>Diese Inhalte sind vorgegeben. Die Antwortwege bestimmen, wer sie erreicht.</p></div>
        </div>
        <div className={styles.fixed}>
          <section className={styles.section}>
            <div className={styles.sectionTitle}><h4>Erreichbarkeit</h4><span>Freitext</span></div>
            <div className={styles.readOnly}><p>{current.freeText[0]}</p></div>
            <p className={styles.sectionHelp}>Nach der letzten Frage und den Freitextfragen geht es hier weiter – außer ein Antwortweg führt direkt zum Abschluss.</p>
          </section>
          <section className={styles.section}>
            <div className={styles.sectionTitle}><h4>Kontaktdaten</h4><span>Nur bei Leads</span></div>
            <div className={styles.readOnly}><p>{current.contact.headline}</p></div>
            <p className={styles.sectionHelp}>Name, Telefonnummer und E-Mail-Adresse werden vor dem Absenden abgefragt.</p>
          </section>
          <section className={styles.section}>
            <div className={styles.sectionTitle}><h4>Lead</h4><span>Bewerbung gesendet</span></div>
            <div className={styles.readOnly}><h4>{current.endings.lead.title}</h4><p>{current.endings.lead.description}</p></div>
            <p className={styles.sectionHelp}>Abschluss mit dem Button „{current.endings.lead.buttonLabel}“.</p>
          </section>
          <section className={styles.section}>
            <div className={styles.sectionTitle}><h4>Kein Lead</h4><span>Ohne Kontaktdaten</span></div>
            <div className={styles.readOnly}><h4>{current.endings.nonLead.title}</h4><p>{current.endings.nonLead.description}</p></div>
            <p className={styles.sectionHelp}>Abschluss mit dem Button „{current.endings.nonLead.buttonLabel}“.</p>
          </section>
        </div>
        <section className={styles.section}>
          <div className={styles.sectionTitle}><h4>Website & Datenschutz</h4><span>Für beide Ausgänge</span></div>
          <TextInput label="Website des Kunden" value={website} onChange={v => { setWebsite(v); setOpened(undefined); }} width="100%" placeholder="https://…" isDisabled={busy} />
          <p className={styles.sectionHelp}>Ziel des Buttons „Website ansehen“ auf beiden Abschlussseiten.</p>
          <div className={styles.privacy}><h4>{current.privacyLinkText}</h4><p>{current.privacyUrl || "Website oben ergänzen."}</p></div>
        </section>
      </fieldset>)}
      {warnings.length > 0 && <Banner status="warning" title="Hinweise zur Vorlage" description={<ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul>} />}
      {current && blockers.length > 0 && <Banner status="warning" title={`${blockers.length} ${blockers.length === 1 ? "Punkt" : "Punkte"} vor dem Testen und Übertragen klären`} description={<ul>{blockers.map(b => <li key={b}>{b}</li>)}</ul>} />}
            </div>
            <FormChat
              send={ask}
              isDisabled={busy || !current}
              hint={current ? "Sag, was sich ändern soll – die Fragen links passen sich an." : "Erst eine Vorlage laden, dann kann hier geändert werden."}
            />
            </div>
          </LayoutContent>}
          footer={<LayoutFooter padding={0}>
            <div className={styles.footer}>
              {current && (replace ? <div className={styles.replace}><p>Das ersetzt deine Fragen und Antwortwege.</p><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" label="Neu vorschlagen" onClick={() => load()} />{form && <Button variant="secondary" size="sm" label={`Aus „${form.name}“`} onClick={() => load(form)} />}<Button variant="ghost" size="sm" label="Behalten" onClick={() => setReplace(false)} /></div></div> : <Button variant="ghost" size="sm" icon={<SparkleIcon size={16} />} label={busy ? "Vorlage wird erstellt…" : "Fragen neu laden"} onClick={() => setReplace(true)} isDisabled={busy} />)}
              <div className={styles.publish}>
                <p>{current ? "In Meta prüfen und mit „Formular erstellen“ abschließen." : busy ? "Dein Vorschlag wird auch bei geschlossenem Fenster weiter vorbereitet." : "Dein Entwurf bleibt beim Schließen erhalten."}</p>
                <Button variant="secondary" label="Schließen" onClick={() => onOpenChange(false)} />
                {current && <Button variant="primary" label="In Meta bauen" onClick={build} isDisabled={busy || blockers.length > 0} />}
              </div>
            </div>
          </LayoutFooter>}
        />
      </Dialog>
    </>
  );
}

/**
 * Das Gespräch neben dem Baukasten. Hält nur den Verlauf – geändert wird über
 * `send`, damit die Fragen an genau einer Stelle leben (FormBuilder).
 */
const WISHES = [
  "Frag zusätzlich nach Berufserfahrung in der Pflege.",
  "Nimm die Führerschein-Frage raus.",
  "Kürzer: höchstens zwei Fragen.",
];

function FormChat({ send, isDisabled, hint }: {
  send: (message: string, history: ChatTurn[]) => Promise<{ reply?: string; error?: string }>;
  isDisabled: boolean;
  hint: string;
}) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages, busy]);

  const submit = async (wish?: string) => {
    const message = (wish ?? text).trim();
    if (!message || busy || isDisabled) return;
    const history = messages;
    setMessages([...history, { role: "user", text: message }]);
    setText("");
    setBusy(true);
    setError(undefined);
    const res = await send(message, history);
    if (res.error) setError(res.error);
    else setMessages(m => [...m, { role: "assistant", text: res.reply || "Erledigt." }]);
    setBusy(false);
  };

  return <aside className={styles.chat} aria-label="Formular im Gespräch ändern">
    <div className={styles.chatHead}>
      <h4>Änderungswünsche</h4>
      <p>{hint}</p>
    </div>
    <div className={styles.chatLog} ref={log} role="log" aria-live="polite">
      {messages.map((m, i) => <p key={i} className={styles.bubble} data-role={m.role}>{m.text}</p>)}
      {busy && <p className={styles.bubble} data-role="assistant">Wird geändert…</p>}
      {!messages.length && !isDisabled && <div className={styles.wishes}>
        {WISHES.map(w => <button type="button" key={w} onClick={() => submit(w)}>{w}</button>)}
      </div>}
    </div>
    {error && <Banner status="error" title="Änderung nicht übernommen" description={error} />}
    <div className={styles.chatForm}>
      <textarea
        className={styles.chatInput}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Was soll anders sein?"
        rows={2}
        disabled={isDisabled || busy}
        aria-label="Änderungswunsch"
        // Enter schickt ab – im Assistenten schickt Enter sonst den ganzen
        // Schritt ab. Umbruch geht mit Umschalt + Enter.
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
      />
      <IconButton variant="primary" size="sm" label="Wunsch senden" icon={<PaperPlaneRightIcon size={16} />} isDisabled={isDisabled || busy || !text.trim()} onClick={() => submit()} />
    </div>
  </aside>;
}

const moveFree = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};

function FormPreview({ spec }: { spec: FormSpec }) {
  const [path, setPath] = useState<(number | "contact" | "lead" | "nolead")[]>([0]);
  const step = path[path.length - 1];
  const question = typeof step === "number" ? spec.questions[step] : undefined;
  // Nach den Fragen folgen die Freitexte (Erreichbarkeit zuletzt), dann die Kontaktdaten.
  const free = typeof step === "number" ? spec.freeText[step - spec.questions.length] : undefined;
  const next = (target: Goto) => {
    const index = typeof step === "number" ? step : 0;
    const after = target === "next" ? index + 1 : typeof target === "number" ? target - 1 : 0;
    setPath([...path, target === "nolead" ? "nolead" : target === "lead" || after >= spec.questions.length + spec.freeText.length ? "contact" : after]);
  };
  return <section className={styles.preview} aria-label="Formular testen">
    <div className={styles.previewHeading}><h4>Ablauf testen</h4><span>Vorschau · es werden keine Daten gesendet</span></div>
    <div className={styles.previewCard} aria-live="polite" aria-atomic="true">
      {question ? <><p>Frage {Number(step) + 1}</p><h3>{question.label}</h3><div className={styles.previewOptions}>{question.options.map(option => <Button key={option} variant="secondary" label={option} onClick={() => next(gotoOf(question, option))} />)}</div></> :
        step === "lead" || step === "nolead" ? <><p>{step === "lead" ? "Ergebnis: Lead" : "Ergebnis: Kein Lead"}</p><h3>{spec.endings[step === "lead" ? "lead" : "nonLead"].title}</h3><p className={styles.previewCopy}>{spec.endings[step === "lead" ? "lead" : "nonLead"].description}</p><p>„Website ansehen“ führt zu {spec.website}</p></> :
        step === "contact" ? <><h3>{spec.contact.headline}</h3><p>Hier geben Bewerber Name, Telefonnummer und E-Mail-Adresse an und bestätigen den Datenschutz.</p><Button variant="primary" label="Bewerbung senden (Test)" onClick={() => setPath([...path, "lead"])} /></> :
        <><p>Freitext</p><h3>{free}</h3><p>{free === REACHABILITY ? "Hier können Bewerber ihre gewünschte Rückrufzeit frei angeben." : "Hier antworten Bewerber in eigenen Worten."}</p><Button variant="secondary" label="Weiter" onClick={() => next("next")} /></>}
    </div>
    <div className={styles.previewNavigation}><Button variant="ghost" label="Zurück" isDisabled={path.length === 1} onClick={() => setPath(path.slice(0, -1))} /><Button variant="secondary" label="Neu starten" onClick={() => setPath([0])} /></div>
  </section>;
}
