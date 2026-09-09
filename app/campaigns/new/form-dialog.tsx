"use client";

/**
 * Der Formular-Editor als Dialog, wie der Drive-Explorer: links der Ablauf,
 * rechts das, was gerade angefasst wird. Der Ablauf ist der Punkt – ein
 * Bewerber läuft von oben nach unten durch, wer ausscheidet, geht nach rechts
 * auf die rote Schiene zu E2, Sprünge nach vorn sind links als Bogen zu sehen,
 * „Formular senden“ als grüner Bogen zu E1. Das ist dieselbe Logik wie in
 * Metas Baukasten, nur so gezeichnet, dass man den Weg sieht statt ihn aus
 * Dropdowns zusammenzulesen. Fest steht, was die Agentur immer gleich baut:
 * Intro, Erreichbarkeit, Kontakt, die beiden Zielseiten – die stehen im
 * Ablauf, sind aber nicht zu bearbeiten (die Website schon).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Banner,
  Button,
  Dialog,
  DialogHeader,
  IconButton,
  Layout,
  LayoutContent,
  LayoutFooter,
  Selector,
  Skeleton,
  Text,
  TextInput,
} from "@astryxdesign/core";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { BRICKS } from "@/lib/form-bricks";
import {
  buildFormSpec,
  CONTACT_HEADLINE,
  formSpecBlockers,
  gotoOf,
  moveQuestion,
  REACHABILITY,
  removeQuestion,
  type FormQuestion,
  type FormSpec,
  type Goto,
} from "@/lib/form-spec";
import { suggestFormAction, type FormSuggestInput } from "../actions";

/** Was im Ablauf angeklickt sein kann: eine Frage (Index) oder ein fester Knoten. */
type Node = number | "intro" | "reach" | "contact" | "lead" | "nolead";

const NEW_QUESTION: FormQuestion = { label: "", options: ["Ja", "Nein"], goto: { Nein: "nolead" } };

export function FormDialog({
  isOpen,
  onOpenChange,
  input,
  extension,
  onBuild,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  input: Omit<FormSuggestInput, "website">;
  extension: string;
  onBuild: (spec: FormSpec) => void;
}) {
  const [spec, setSpec] = useState<FormSpec>();
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [website, setWebsite] = useState("");
  const [hint, setHint] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Node>(0);

  const suggest = async (hintText: string) => {
    setBusy(true);
    setError(undefined);
    const res = await suggestFormAction({ ...input, website, hint: hintText || undefined });
    setWarnings(res.warnings);
    setError(res.error);
    if (res.spec) {
      setSpec(res.spec);
      setQuestions(res.spec.questions);
      setWebsite(res.spec.website);
      setSelected(0);
    }
    setBusy(false);
  };

  // Beim Öffnen gleich vorschlagen – der Dialog soll mit einem Formular
  // aufgehen, nicht mit einem Knopf davor.
  useEffect(() => {
    if (isOpen && !spec && !busy) void suggest("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
  const blockers = current ? formSpecBlockers({ ...current, questions }) : [];

  const update = (i: number, patch: Partial<FormQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const add = (q: FormQuestion = NEW_QUESTION) => {
    setQuestions((qs) => [...qs, { ...q, goto: { ...q.goto } }]);
    setSelected(questions.length);
  };

  const q = typeof selected === "number" ? questions[selected] : undefined;

  return (
    <Dialog isOpen={isOpen} onOpenChange={busy ? () => {} : onOpenChange} width={1040}>
      <Layout
        header={
          <DialogHeader
            title="Lead-Formular"
            subtitle={current ? `${current.name} · ${current.intro.title}` : undefined}
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            {error && <Banner status="error" title="Vorlage nicht erstellt" description={error} />}
            {!spec && busy ? (
              <FlowSkeleton />
            ) : (
              spec && (
                <div className="grid grid-cols-[1fr_22rem] gap-6">
                  <Flow
                    questions={questions}
                    intro={current!.intro.title}
                    selected={selected}
                    onSelect={setSelected}
                    onAdd={() => add()}
                    canAdd={questions.length < 6}
                  />
                  <aside className="space-y-4 self-start">
                    {q ? (
                      <QuestionEditor
                        index={selected as number}
                        question={q}
                        questions={questions}
                        onChange={(patch) => update(selected as number, patch)}
                        onMove={(dir) => {
                          setQuestions((qs) => moveQuestion(qs, selected as number, dir));
                          setSelected((selected as number) + dir);
                        }}
                        onRemove={() => {
                          setQuestions((qs) => removeQuestion(qs, selected as number));
                          setSelected(Math.max(0, (selected as number) - 1));
                        }}
                      />
                    ) : selected === "lead" || selected === "nolead" ? (
                      <EndingEditor spec={current!} which={selected} website={website} onWebsite={setWebsite} />
                    ) : (
                      <FixedInfo spec={current!} node={selected} />
                    )}

                    <Bricks used={questions} onPick={add} isDisabled={questions.length >= 6} />

                    <div className="border-line space-y-2 border-t pt-4">
                      <TextInput
                        label="Hinweis an die KI"
                        value={hint}
                        onChange={setHint}
                        width="100%"
                        placeholder="z. B. nur Fachkräfte, Nachtdienst ist Pflicht"
                        size="sm"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<SparkleIcon size={16} weight="fill" />}
                        label={busy ? "Vorlage entsteht…" : "Neu vorschlagen"}
                        onClick={() => void suggest(hint)}
                        isDisabled={busy}
                      />
                    </div>
                  </aside>
                </div>
              )
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {[...blockers, ...warnings].slice(0, 2).map((w) => (
                  <Text key={w} type="supporting" as="p" className="truncate">
                    {w}
                  </Text>
                ))}
                {!blockers.length && !warnings.length && current && (
                  <Text type="supporting" as="p">
                    Erweiterung v{extension} baut bis zur Prüfung – „Formular erstellen“ klickst du in Meta.
                  </Text>
                )}
              </div>
              <Button variant="secondary" label="Abbrechen" onClick={() => onOpenChange(false)} />
              <Button label="In Meta bauen" onClick={() => current && onBuild(current)} isDisabled={!current || busy || blockers.length > 0} />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

// ------------------------------------------------------------------ Ablauf

/**
 * Der Ablauf: Knoten untereinander, dazwischen eine Linie. Rechts die rote
 * Schiene für „Kein Lead“, links der Rand für Sprünge (gold) und „Formular
 * senden“ (grün) – gezeichnet in einem SVG über der Liste, mit den
 * gemessenen Positionen der Knoten.
 */
function Flow({
  questions,
  intro,
  selected,
  onSelect,
  onAdd,
  canAdd,
}: {
  questions: FormQuestion[];
  intro: string;
  selected: Node;
  onSelect: (n: Node) => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rows = useRef<Map<string, HTMLElement>>(new Map());
  const [arcs, setArcs] = useState<{ d: string; kind: "jump" | "lead" }[]>([]);
  const [height, setHeight] = useState(0);

  // Bögen aus den Kanten der Zeilen: Frage i, Antwort k → Knoten j.
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const top = root.getBoundingClientRect().top;
    const y = (key: string, edge: "mid" | "top") => {
      const el = rows.current.get(key);
      if (!el) return undefined;
      const r = el.getBoundingClientRect();
      return (edge === "mid" ? r.top + r.height / 2 : r.top + 12) - top;
    };
    const out: typeof arcs = [];
    questions.forEach((q, i) =>
      q.options.forEach((o, k) => {
        const g = gotoOf(q, o);
        const from = y(`a${i}.${k}`, "mid");
        const to = g === "lead" ? y("lead", "top") : typeof g === "number" ? y(`q${g - 1}`, "top") : undefined;
        if (from === undefined || to === undefined) return;
        const bend = 14 + Math.min(18, Math.abs(to - from) / 12);
        out.push({ kind: g === "lead" ? "lead" : "jump", d: `M 40 ${from} C ${40 - bend} ${from}, ${40 - bend} ${to}, 40 ${to}` });
      }),
    );
    setArcs(out);
    setHeight(root.getBoundingClientRect().height);
  }, [questions, selected]);

  const reg = (key: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(key, el);
    else rows.current.delete(key);
  };
  const hasNoLead = questions.some((q) => q.options.some((o) => gotoOf(q, o) === "nolead"));

  return (
    <div ref={box} className="relative pr-28 pl-10">
      <svg className="pointer-events-none absolute inset-y-0 left-0 w-10 overflow-visible" width={40} height={height} aria-hidden>
        {arcs.map((a, i) => (
          <path
            key={i}
            d={a.d}
            fill="none"
            strokeWidth={2}
            className={a.kind === "lead" ? "stroke-success-700" : "stroke-gold-600"}
            markerEnd={`url(#arrow-${a.kind})`}
          />
        ))}
        <defs>
          <marker id="arrow-jump" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" className="fill-gold-600" />
          </marker>
          <marker id="arrow-lead" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" className="fill-success-700" />
          </marker>
        </defs>
      </svg>

      {/* Die rote Schiene: von der ersten Frage bis E2, nur wenn eine Antwort dorthin führt. */}
      {hasNoLead && <div className="bg-danger/40 absolute top-16 right-14 bottom-8 w-0.5" aria-hidden />}

      <ol className="space-y-0">
        <li>
          <FixedNode label={intro} kind="Start" isSelected={selected === "intro"} onSelect={() => onSelect("intro")} />
        </li>
        {questions.map((q, i) => (
          <li key={i} ref={reg(`q${i}`)} className="relative">
            <Connector />
            <QuestionNode
              index={i}
              question={q}
              isSelected={selected === i}
              onSelect={() => onSelect(i)}
              regAnswer={(k) => reg(`a${i}.${k}`)}
            />
          </li>
        ))}
        <li className="py-1 pl-3">
          <Button variant="ghost" size="sm" icon={<PlusIcon size={14} />} label="Frage" onClick={onAdd} isDisabled={!canAdd} />
        </li>
        <li ref={reg("reach")}>
          <Connector />
          <FixedNode label={REACHABILITY} kind={`F${questions.length + 1} · Freitext`} isSelected={selected === "reach"} onSelect={() => onSelect("reach")} />
        </li>
        <li ref={reg("contact")}>
          <Connector />
          <FixedNode label={CONTACT_HEADLINE} kind="Kontakt · Name, Telefon, E-Mail" isSelected={selected === "contact"} onSelect={() => onSelect("contact")} />
        </li>
        <li ref={reg("lead")} className="relative">
          <Connector />
          <div className="flex items-start gap-3">
            <EndNode which="lead" isSelected={selected === "lead"} onSelect={() => onSelect("lead")} />
            {hasNoLead && (
              <div className="absolute -right-28 top-6">
                <EndNode which="nolead" isSelected={selected === "nolead"} onSelect={() => onSelect("nolead")} />
              </div>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}

const Connector = () => <div className="bg-line-strong ml-6 h-4 w-0.5" aria-hidden />;

function QuestionNode({
  index,
  question,
  isSelected,
  onSelect,
  regAnswer,
}: {
  index: number;
  question: FormQuestion;
  isSelected: boolean;
  onSelect: () => void;
  regAnswer: (k: number) => (el: HTMLElement | null) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`bg-surface w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none ${
        isSelected ? "border-gold-500 ring-gold-500 ring-1" : "border-line hover:border-gold-500"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-ink-500 text-xs font-semibold tabular-nums">F{index + 1}</span>
        <span className={`text-sm font-medium ${question.label.trim() ? "" : "text-ink-300 italic"}`}>{question.label.trim() || "Frage ohne Text"}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {question.options.map((o, k) => {
          const g = gotoOf(question, o);
          return (
            <li key={k} ref={regAnswer(k)} className="relative flex items-center gap-2 text-sm">
              <AnswerMark goto={g} />
              <span className={`min-w-0 flex-1 truncate ${o.trim() ? "" : "text-ink-300 italic"}`}>{o.trim() || "Antwort ohne Text"}</span>
              <TargetTag goto={g} />
              {/* Die Verbindung zur roten Schiene – über den Rand der Karte hinaus. */}
              {g === "nolead" && <span className="bg-danger/40 absolute top-1/2 -right-3 h-0.5 w-14 translate-x-full" aria-hidden />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ein Punkt je Antwort in der Farbe des Ziels – schnell zu überfliegen. */
function AnswerMark({ goto }: { goto: Goto }) {
  const cls =
    goto === "nolead" ? "bg-danger" : goto === "lead" ? "bg-success-700" : typeof goto === "number" ? "bg-gold-600" : "bg-line-strong";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden />;
}

function TargetTag({ goto }: { goto: Goto }) {
  if (goto === "next") return null;
  const [text, cls] =
    goto === "nolead"
      ? ["Kein Lead", "text-danger-700"]
      : goto === "lead"
        ? ["Formular senden", "text-success-700"]
        : [`→ F${goto}`, "text-gold-700"];
  return <span className={`shrink-0 text-xs font-medium ${cls}`}>{text}</span>;
}

function FixedNode({ label, kind, isSelected, onSelect }: { label: string; kind: string; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={`bg-surface-secondary w-full rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none ${
        isSelected ? "border-gold-500 ring-gold-500 ring-1" : "border-line hover:border-gold-500"
      }`}
    >
      <span className="text-ink-500 block text-xs">{kind}</span>
      <span className="block truncate text-sm">{label}</span>
    </button>
  );
}

function EndNode({ which, isSelected, onSelect }: { which: "lead" | "nolead"; isSelected: boolean; onSelect: () => void }) {
  const lead = which === "lead";
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={`flex w-40 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none ${
        isSelected ? "border-gold-500 ring-gold-500 ring-1" : "border-line hover:border-gold-500"
      } ${lead ? "bg-success-700/10" : "bg-danger/10"}`}
    >
      {lead ? <CheckIcon size={16} weight="bold" className="text-success-700" /> : <XIcon size={16} weight="bold" className="text-danger-700" />}
      <span>
        <span className="text-ink-500 block text-xs">{lead ? "E1" : "E2"}</span>
        {lead ? "Lead" : "Kein Lead"}
      </span>
    </button>
  );
}

function FlowSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_22rem] gap-6" aria-busy>
      <div className="space-y-3 pl-10">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={88} radius={3} index={i} />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton height={20} width={180} radius={1} index={4} />
        <Skeleton height={140} radius={3} index={5} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Rechts

function QuestionEditor({
  index,
  question,
  questions,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  question: FormQuestion;
  questions: FormQuestion[];
  onChange: (patch: Partial<FormQuestion>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const setOption = (k: number, text: string) => {
    const old = question.options[k];
    const goto = { ...question.goto };
    if (old in goto) {
      const g = goto[old];
      delete goto[old];
      goto[text] = g;
    }
    onChange({ options: question.options.map((o, m) => (m === k ? text : o)), goto });
  };
  const setGoto = (option: string, value: string) => {
    const goto = { ...question.goto };
    if (value === "next") delete goto[option];
    else goto[option] = /^\d+$/.test(value) ? Number(value) : (value as Goto);
    onChange({ goto });
  };
  const removeOption = (k: number) => {
    const goto = { ...question.goto };
    delete goto[question.options[k]];
    onChange({ options: question.options.filter((_, m) => m !== k), goto });
  };
  const short = (s: string) => (s.length > 28 ? `${s.slice(0, 26)}…` : s);
  const later = questions.slice(index + 2).map((q, k) => ({ value: String(index + k + 3), label: `→ F${index + k + 3} ${short(q.label) || "(ohne Text)"}` }));
  const targets = [
    { value: "next", label: "Weiter" },
    ...(later.length ? [{ type: "section" as const, title: "Springe zu", options: later }] : []),
    { type: "divider" as const },
    { value: "lead", label: "Formular senden" },
    { value: "nolead", label: "Kein Lead" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1">
        <Text type="supporting" as="h3" className="flex-1 font-semibold">
          Frage F{index + 1}
        </Text>
        <IconButton variant="ghost" size="sm" label="Nach oben" icon={<ArrowUpIcon size={16} />} isDisabled={index === 0} onClick={() => onMove(-1)} />
        <IconButton variant="ghost" size="sm" label="Nach unten" icon={<ArrowDownIcon size={16} />} isDisabled={index === questions.length - 1} onClick={() => onMove(1)} />
        <IconButton variant="ghost" size="sm" label="Frage entfernen" icon={<TrashIcon size={16} />} onClick={onRemove} />
      </div>
      <TextInput label="Frage" isLabelHidden value={question.label} onChange={(v) => onChange({ label: v })} placeholder="Frage" width="100%" />
      <ul className="space-y-2">
        {question.options.map((o, k) => (
          <li key={k} className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <TextInput label={`Antwort ${k + 1}`} isLabelHidden value={o} onChange={(v) => setOption(k, v)} placeholder="Antwort" size="sm" width="100%" />
            </div>
            <Selector
              label={`Ziel von „${o || `Antwort ${k + 1}`}“`}
              isLabelHidden
              size="sm"
              width={132}
              options={targets}
              value={String(gotoOf(question, o))}
              onChange={(v) => setGoto(o, v)}
              isDisabled={!o.trim()}
            />
            <IconButton variant="ghost" size="sm" label="Antwort entfernen" icon={<TrashIcon size={14} />} isDisabled={question.options.length <= 2} onClick={() => removeOption(k)} />
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        icon={<PlusIcon size={14} />}
        label="Antwort"
        isDisabled={question.options.length >= 4}
        onClick={() => onChange({ options: [...question.options, ""] })}
      />
    </section>
  );
}

function EndingEditor({ spec, which, website, onWebsite }: { spec: FormSpec; which: "lead" | "nolead"; website: string; onWebsite: (v: string) => void }) {
  const e = which === "lead" ? spec.endings.lead : spec.endings.nonLead;
  return (
    <section className="space-y-3">
      <Text type="supporting" as="h3" className="font-semibold">
        {which === "lead" ? "E1 · Zielseite für Leads" : "E2 · Zielseite für Nicht-Leads"}
      </Text>
      <div className="bg-surface-secondary space-y-1 rounded-lg p-3 text-sm">
        <p className="font-medium">{e.title}</p>
        <p className="text-ink-500 whitespace-pre-line">{e.description}</p>
        <p className="text-ink-500">Knopf: „{e.buttonLabel}“ → Website</p>
      </div>
      <TextInput label="Website" value={website} onChange={onWebsite} width="100%" placeholder="https://…" />
      <Text type="supporting" as="p">
        Datenschutz: {spec.privacyLinkText} → {spec.privacyUrl || "–"}
      </Text>
    </section>
  );
}

function FixedInfo({ spec, node }: { spec: FormSpec; node: Node }) {
  const [title, body] =
    node === "intro"
      ? ["Start", `${spec.intro.title}\n${spec.intro.description}`]
      : node === "reach"
        ? ["Erreichbarkeit", `${REACHABILITY}\nFreitext, immer die letzte Frage – führt zu „Formular senden“.`]
        : ["Kontakt", `${CONTACT_HEADLINE}\nName, Telefon, E-Mail – Meta füllt sie aus dem Profil vor.`];
  return (
    <section className="space-y-3">
      <Text type="supporting" as="h3" className="font-semibold">
        {title}
      </Text>
      <p className="bg-surface-secondary text-ink-500 rounded-lg p-3 text-sm whitespace-pre-line">{body}</p>
      <Text type="supporting" as="p">
        Steht in jedem Formular der Agentur gleich – hier nur zum Nachlesen.
      </Text>
    </section>
  );
}

/** Die Bausteine: fertige Fragen mit Logik, ein Klick hängt sie an. Schon drin = ausgegraut. */
function Bricks({ used, onPick, isDisabled }: { used: FormQuestion[]; onPick: (q: FormQuestion) => void; isDisabled: boolean }) {
  const has = (label: string) => used.some((q) => q.label.trim().toLowerCase() === label.toLowerCase());
  return (
    <section className="space-y-2">
      <Text type="supporting" as="h3" className="font-semibold">
        Bausteine
      </Text>
      <ul className="flex flex-wrap gap-1.5">
        {BRICKS.map((b) => {
          const off = isDisabled || has(b.question.label);
          return (
            <li key={b.id}>
              <button
                type="button"
                disabled={off}
                onClick={() => onPick(b.question)}
                title={b.question.options.join(" / ")}
                className="bg-surface border-line hover:border-gold-500 focus-visible:ring-gold-500 max-w-full truncate rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:opacity-40 disabled:hover:border-line"
              >
                {b.question.label}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
