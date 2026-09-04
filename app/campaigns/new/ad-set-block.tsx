"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Banner,
  Button,
  createStaticSource,
  Divider,
  Heading,
  DropdownMenu,
  Skeleton,
  Text,
  TextArea,
  TextInput,
  Toolbar,
  Typeahead,
  type SearchableItem,
} from "@astryxdesign/core";
import { PlusIcon, SparkleIcon, XIcon } from "@phosphor-icons/react";
import type { LeadForm } from "@/lib/forms";
import { instantFormsUrl, matchFormHint, newlyAppeared } from "@/lib/forms";
import type { Source } from "@/lib/brief";
import { cleanStem, nextCreativeName } from "@/lib/media";
import { cityOf } from "./state";
import { DriveShelf } from "./drive-shelf";
import { Herkunft } from "./herkunft";
import { report } from "./activity";
import { BODY_TEMPLATE_COUNT, TITLE_COUNT } from "@/lib/bodies";
import { plural } from "@/lib/labels";
import { LocationField } from "./location-field";
import { checkCopy, type CopyField, type Notice } from "@/lib/copy";
import { enqueue, retryUploads, useUploads, type Pickable } from "./upload-queue";
import { AdTile, ContentGrid, LooseTile, UploadTile, type AssetSlot } from "./content-grid";
import {
  applyCrop,
  detachAd,
  dissolveAd,
  needsSecondText,
  promoteLoose,
  swapPair,
  type WizardAd,
  type WizardAdSet,
  type WizardAsset,
  type WizardImageAsset,
} from "./state";
import {
  generateBodyAction,
  generateDescriptionAction,
  generateTitlesAction,
  listFormsAction,
  pullFormAction,
} from "../actions";

const BODY_LIMIT = 4399;
const TITLE_LIMIT = 255;
const DESCRIPTION_LIMIT = 1500;
const MAX_ITEMS = 5;

/** Was der Browser an Dateien annimmt – der Route Handler lehnt alles andere ab. */
// .zip als Endung, nicht als MIME-Typ: Windows meldet ZIPs je nach Programm
// als application/x-zip-compressed, die Endung greift überall.
const ACCEPT = "video/*,image/jpeg,image/png,.zip";

/** Ein Lead-Formular, verpackt für den Typeahead — id verdoppelt sich als
 *  Suchbegriff, damit eine kopierte Formular-ID genau wie der Name greift. */
type FormItem = SearchableItem<LeadForm> & { auxiliaryData: LeadForm };
const toFormItem = (f: LeadForm): FormItem => ({ id: f.id, label: f.name, auxiliaryData: f });

/**
 * Der Dateiwähler.
 *
 * Das native <input type="file"> war das einzige Bedienelement dieser Seite,
 * das nichts von ihr wusste: ein graues „Datei auswählen“ mit „Keine
 * ausgewählt“ daneben, in einer Reihe mit Feldern, die alle einen Rand, eine
 * Höhe und eine Beschriftung haben. Es steht weiterhin da – nur unsichtbar und
 * aus der Tab-Reihenfolge genommen, geöffnet wird es vom Knopf. Am Verhalten
 * ändert das nichts, an der Erwartung alles: hier fängt die Arbeit an, und das
 * darf man dem Kasten ansehen.
 */
function FilePicker({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`bg-surface-secondary flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-dashed p-4 transition-colors ${
        over ? "border-gold-500 ring-gold-500 ring-1" : "border-line"
      }`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        void filesFromDrop(e.dataTransfer).then((files) => files.length && onFiles(files));
      }}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        tabIndex={-1}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles([...e.target.files]);
          e.target.value = "";
        }}
      />
      <Button variant="secondary" label="Dateien wählen" onClick={() => input.current?.click()} />
      {/* Kurz, weil es bei jeder Anzeigengruppe steht. Was die Paarung im
          Einzelnen erkennt, sagt jede Kachel selbst in ihrer Statuszeile. */}
      <Text type="supporting" as="div" className="min-w-0 flex-1">
        Oder Dateien, Ordner und ZIPs hierher ziehen. Videos werden UGC-Anzeigen; Fotos finden ihre
        9:16- und 1:1-Hälfte über Namen und Motiv, der Rest lässt sich ziehen oder zuschneiden.
      </Text>
    </div>
  );
}

/**
 * Was aus dem Finder oder Explorer fallen gelassen wurde – auch ganze Ordner.
 * `dataTransfer.files` enthält einen Ordner als leere Datei; nur über
 * webkitGetAsEntry lässt er sich durchlaufen. Versteckte Dateien und
 * Ressourcen-Doubletten (._Creative 1.png) bleiben draußen, wie beim ZIP.
 */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => Boolean(e));
  if (!entries.length) return [...dt.files];

  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.name.startsWith(".")) return;
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push(file);
      return;
    }
    if (!entry.isDirectory) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries liefert in Häppchen und meldet das Ende mit einer leeren Liste.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const child of batch) await walk(child);
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}

/**
 * Ein Paar darf gegen die Regel gebildet werden – aber nicht unbemerkt. Der
 * Hinweis steht an der Karte und hält niemanden auf.
 */
function pairWarning(portrait: WizardAsset, square: WizardAsset): string | undefined {
  if (portrait.orientation === square.orientation)
    return "Beide Hälften haben das gleiche Format — eine sollte 9:16 sein, die andere 1:1.";
  if (portrait.kind !== square.kind) return "Dieses Paar mischt ein Video und ein Bild.";
  if (portrait.kind === "video") return "Zwei Videos von Hand gepaart — Videos laufen normalerweise als UGC-Anzeigen.";
  return undefined;
}

/**
 * Hinweise zum Text, direkt am jeweiligen Feld. Nichts davon hält jemanden auf –
 * die Regeln sind an den laufenden Kampagnen gemessen (siehe lib/copy.ts), aber
 * eine Stellenanzeige darf jederzeit anders aussehen als die letzten hundert.
 */
function CopyNotices({ notices, field }: { notices: Notice[]; field: CopyField }) {
  const mine = notices.filter((n) => n.field === field);
  if (!mine.length) return null;
  return (
    <ul className="space-y-1">
      {mine.map((n) => (
        <li
          key={n.message}
          className={`text-xs ${n.level === "warn" ? "text-danger-700" : "text-ink-500"}`}
        >
          <span aria-hidden>{n.level === "warn" ? "▲" : "ℹ"}</span>{" "}
          <span className="sr-only">{n.level === "warn" ? "Warnung:" : "Hinweis:"}</span>
          {n.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * Fünf Primärtexte und fünf Überschriften sind hier der Normalfall, nicht die
 * Ausnahme. Untereinander gestellt waren das zehn volle Feldbreiten in einer
 * Spalte: man scrollt an ihnen entlang und kann nie zwei davon nebeneinander
 * lesen – dabei ist genau das die Arbeit, die hier getan wird (fünf Varianten
 * desselben Textes gegeneinander abwägen).
 *
 * Also zu zweit nebeneinander, in einem Raster gleich breiter Felder, und die
 * Höhe des Rasters begrenzt: der Abschnitt bleibt so lang wie ein Abschnitt und
 * nicht wie eine Seite. Jedes Feld trägt seine eigene Nummer – ohne sie hieß in
 * der Vorlesung jedes Feld gleich, nämlich gar nicht.
 */
function TextListField({
  label: labelText,
  singular,
  values,
  limit,
  multiline,
  action,
  pending,
  onChange,
}: {
  label: string;
  /** Wie ein einzelner Eintrag heißt – „Primärtext 3" steht an jedem Feld. */
  singular: string;
  values: string[];
  limit: number;
  multiline?: boolean;
  /** Was diese Liste außer „hinzufügen“ noch kann – bei den Überschriften das Generieren. */
  action?: ReactNode;
  /** Je Slot: läuft dort gerade eine Generierung? Dann Skelett statt Feld –
   *  und kein Hinzufügen/Entfernen, solange irgendwo eins läuft, sonst
   *  schrieben die per Index eintreffenden Antworten in den falschen Slot. */
  pending?: boolean[];
  onChange: (values: string[]) => void;
}) {
  const anyPending = pending?.some(Boolean) ?? false;
  const update = (i: number, v: string) =>
    onChange(values.map((val, idx) => (idx === i ? v : val)));
  const add = () => onChange([...values, ""]);
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div role="group" aria-label={labelText} className="space-y-4">
      {/* Ein Kopf, eine Zeile: Name und Zähler links, rechts leise die zwei
          Handlungen. „Hinzufügen“ steht nur, wenn noch Platz ist – ein
          ausgegrauter Knopf an fünf von fünf Listen war nur ein Kasten mehr. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text type="label" as="div">
          {labelText}{" "}
          <span className="text-ink-500 font-normal tabular-nums">
            {values.length}/{MAX_ITEMS}
          </span>
        </Text>
        <div className="flex flex-wrap items-center gap-1">
          {action}
          {values.length < MAX_ITEMS && (
            <Button
              variant="ghost"
              size="sm"
              icon={<PlusIcon size={14} weight="bold" />}
              label={singular}
              onClick={add}
              isDisabled={anyPending}
            />
          )}
        </div>
      </div>

      {/* Rand statt Vorgabe-Innenpolster: der Fokusring liegt außerhalb des
          Feldrands. Kein eigener Scrollbereich mehr – fünf Felder in zwei
          Spalten passen, und ein Fenster im Fenster machte den Abschnitt eng. */}
      <div className="px-0.5 py-1">
        <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
          {values.map((v, i) => (
            // Der Entfernen-Knopf erscheint erst beim Überfahren oder Fokus:
            // fünf X in einer Reihe sind fünf Angebote, etwas wegzuwerfen.
            <div key={i} className="group min-w-0 space-y-1.5">
              <div className="flex h-7 items-center justify-between gap-2">
                <span className="text-ink-500 text-xs font-medium">
                  {singular} {i + 1}
                  {/* TextInput hat keinen eingebauten Zeichenzähler; die
                      description-Prop wäre hier eine Lösung, aber isLabelHidden
                      blendet description zusammen mit dem Label auf srOnly aus
                      (FieldLabel.tsx) — ein Zähler, den niemand sieht, bis das
                      Feld schon zu lang ist. Deshalb steht der Zähler hier
                      sichtbar, im selben Muster wie der Gruppenzähler oben. */}
                  {!multiline && (
                    <span
                      className={`ml-1 font-normal tabular-nums ${
                        v.length > limit ? "text-danger-700" : "text-ink-500"
                      }`}
                    >
                      ({v.length}/{limit})
                    </span>
                  )}
                </span>
                {values.length > 1 && (
                  <span className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      isIconOnly
                      icon={<XIcon size={14} weight="bold" />}
                      label={`${singular} ${i + 1} entfernen`}
                      onClick={() => remove(i)}
                      isDisabled={anyPending}
                    />
                  </span>
                )}
              </div>
              {pending?.[i] ? (
                // Skeleton misst sich über width/height-Props (StyleX-Vars),
                // nicht über Tailwind-Klassen – h-4 verlor gegen das
                // eingebaute height:100% und der Kasten fiel auf 0 zusammen.
                // index staffelt die Welle über die Slots.
                <div
                  className="ki-schimmer space-y-2"
                  aria-label={`${singular} ${i + 1} wird generiert…`}
                >
                  {multiline ? (
                    <>
                      <Skeleton height={14} width="100%" radius={1} index={i * 3} />
                      <Skeleton height={14} width="83%" radius={1} index={i * 3 + 1} />
                      <Skeleton height={14} width="62%" radius={1} index={i * 3 + 2} />
                    </>
                  ) : (
                    <Skeleton height={14} width="70%" radius={1} index={i} />
                  )}
                </div>
              ) : multiline ? (
                // Vier Zeilen, nicht fünf: erst damit passen die üblichen fünf
                // Primärtexte in zwei Spalten ohne Scrollen ins Feld. TextArea
                // zeigt den Zeichenzähler eingebaut über maxLength an — und
                // anders als TextInputs description bleibt der bei
                // isLabelHidden sichtbar.
                <TextArea
                  label={`${singular} ${i + 1}`}
                  isLabelHidden
                  value={v}
                  onChange={(nv) => update(i, nv)}
                  rows={4}
                  maxLength={limit}
                  width="100%"
                />
              ) : (
                // description bleibt zusätzlich gesetzt (sichtbarer Zähler
                // steht daneben, siehe oben): sie hängt unabhängig von
                // isLabelHidden per aria-describedby am Input und wird beim
                // Fokussieren vorgelesen, auch wenn sie selbst unsichtbar ist.
                <TextInput
                  label={`${singular} ${i + 1}`}
                  isLabelHidden
                  value={v}
                  onChange={(nv) => update(i, nv)}
                  width="100%"
                  description={`${v.length}/${limit}`}
                  status={v.length > limit ? { type: "error" } : undefined}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Astryx hat kein Fieldset — HeroUIs Fieldset war selbst nur benanntes,
 * gruppierendes Markup ohne eigenes Verhalten (kein Popover, kein Fokus-Trap),
 * also reicht natives <fieldset>/<legend>. Tailwinds Preflight nullt beide
 * Elemente ohnehin (kein Browser-Rand, keine Standardschrift), deshalb kein
 * CSS-Override nötig. Die Maße (flex-Spalte mit gap-6, Legende in
 * text-base/medium) sind aus fieldset.styles.ts übernommen.
 */
function FieldsetSection({
  legend,
  satz,
  action,
  children,
}: {
  legend: ReactNode;
  /** Ein Satz unter dem Titel: was der Abschnitt entscheidet. */
  satz?: ReactNode;
  /** Die eine Handlung des Abschnitts, rechts vom Titel. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Der Kopf steht außerhalb der <legend>: die darf nur Fließtext tragen,
    // und der Kopf ist Titel, Satz und Knopf in einer Zeile. Die Legende
    // bleibt für Vorleser da, unsichtbar.
    <fieldset className="flex flex-col gap-8">
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <Heading level={3}>{legend}</Heading>
          {satz && (
            <Text type="supporting" color="secondary" as="p" className="max-w-prose">
              {satz}
            </Text>
          )}
        </div>
        {action}
      </div>
      {children}
    </fieldset>
  );
}

export function AdSetBlock({
  value,
  pageId,
  pageName,
  instagramUserId,
  instagramLabel,
  adAccount,
  business,
  roles,
  roleFreeText,
  blockers,
  otherAdSets,
  borrowersOfAd,
  benefits,
  benefitsSource,
  onBenefitsChange,
  autoGenerate,
  primary,
  stage,
  formHint,
  driveFolderId,
  locationSource,
  onChange,
  onRemove,
  canRemove,
}: {
  value: WizardAdSet;
  pageId: string;
  pageName: string;
  instagramUserId?: string;
  instagramLabel?: string;
  adAccount: string;
  /** Der beworbene Kunde – für die Namensregel in lib/copy.ts. */
  business: string;
  /**
   * Die gesuchten Rollen aus Schritt 3 – sie stehen in den generierten Texten.
   * Seit Anzeigen vor Details liegen, sind sie hier meist noch leer; der
   * Generator kommt damit zurecht und schreibt dann allgemeiner.
   */
  roles: string[];
  roleFreeText?: string;
  /** Was hier noch fehlt (adSetBlockers) – dieselbe Liste, die die Kopfzeile zählt. */
  blockers: string[];
  /** Andere Anzeigengruppen dieser Kampagne, aus denen geliehen werden kann. */
  otherAdSets: { id: string; name: string; ads: WizardAd[] }[];
  borrowersOfAd: (adId: string) => string[];
  /** Die Benefits – im Entwurf, nicht mehr im Dialog. Einmal für alle drei Generatoren. */
  benefits: string;
  benefitsSource?: Source;
  onBenefitsChange: (benefits: string) => void;
  /** Beim ersten Anzeigen mit leeren Texten sofort generieren – der Vorschlag ist ein Vorschlag. */
  autoGenerate: boolean;
  /** Die erste Anzeigengruppe: sie allein meldet die Formularliste ins Protokoll. */
  primary: boolean;
  /**
   * „inhalt“: solange der Assistent liest und schreibt, steht nur der Inhalt –
   * das Einzige, was in der Zeit von Hand zu tun ist. „alles“, sobald er fertig
   * ist: Standort, Formular, Texte erscheinen mit dem Schritt-Einzug.
   */
  stage: "inhalt" | "alles";
  /** Aus der Aufgabe: nach welchem Namen oder Ort das Formular zu wählen ist. */
  formHint?: string;
  /** Aus ClickUp: das Regal startet dort statt bei der Namenssuche. */
  driveFolderId?: string;
  /** Herkunft des vorbelegten Standorts – Etikett unter dem Standortfeld (nur erste Anzeigengruppe). */
  locationSource?: Source;
  /** Als Funktion, wenn der Patch auf dem aktuellen Stand aufbauen muss – siehe addAssets. */
  onChange: (patch: Partial<WizardAdSet> | ((set: WizardAdSet) => Partial<WizardAdSet>)) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [formsError, setFormsError] = useState<string>();
  const [formsLoading, setFormsLoading] = useState(false);
  const [formIdInput, setFormIdInput] = useState("");
  const [pulling, setPulling] = useState(false);
  // Generiert wird direkt in den Formularfeldern: hier steht, welcher Slot
  // noch auf seine Antwort wartet (Skelett) und was schiefging.
  const [pendingBodies, setPendingBodies] = useState<boolean[]>([]);
  const [pendingTitles, setPendingTitles] = useState<boolean[]>([]);
  const [pendingDescription, setPendingDescription] = useState(false);
  const [genErrors, setGenErrors] = useState<string[]>([]);
  // „Generieren“ mitten im Lauf: Antworten des alten Laufs dürfen weder
  // Felder noch frische Skelette füllen. Zwei Zähler, denn eine gestartete
  // Beschreibung darf einen laufenden Primärtexte-Lauf nicht entwerten.
  const bodiesRun = useRef(0);
  const titlesRun = useRef(0);
  const descriptionRun = useRef(0);

  // Ein Aufruf für alle fünf: Überschriften sind kurz, und ob „Pflege-Jobs in
  // Dresden“ neben „Pflegefachkraft (m/w/d) gesucht“ stehen darf, weiß nur,
  // wer beide sieht – fünf Einzelaufrufe schrieben fünfmal fast dasselbe.
  // Woraus die Texte entstehen, in einem Halbsatz – steht im Protokoll der
  // Werkstatt, damit sichtbar ist, was Mistral bekommen hat.
  const textBasis = () =>
    [
      roles.length ? roles.join(", ") : roleFreeText || "ohne Rolle",
      value.place?.name ?? value.addressString ?? "",
      benefits.trim() ? `${benefits.trim().split("\n").length} Benefits` : "ohne Benefits",
    ]
      .filter(Boolean)
      .join(" · ");

  // Bei mehreren Standorten trägt die Protokollzeile den Namen der Gruppe –
  // sonst stünde dreimal „Primärtexte“ untereinander.
  const named = (what: string) => (otherAdSets.length ? `${what} · ${cityOf(value.addressString) || value.name}` : what);
  const aid = (what: string) => `${what}:${value.id}`;

  const generateTitles = async () => {
    const myRun = ++titlesRun.current;
    setGenErrors([]);
    setPendingTitles(Array(TITLE_COUNT).fill(true));
    onChange({ titles: Array(TITLE_COUNT).fill("") });
    const label = named("Überschriften");
    report({ id: aid("titel"), label, status: "running", detail: `Mistral schreibt ${TITLE_COUNT} Überschriften aus ${textBasis()}…` });
    const res = await generateTitlesAction({
      business,
      roles,
      roleFreeText,
      place: value.place?.name ?? value.addressString,
      benefits,
    });
    if (titlesRun.current !== myRun) return;
    if (res.titles.length)
      onChange((set) => ({
        titles: set.titles.map((t, i) => res.titles[i] ?? t),
      }));
    if (res.error) setGenErrors((e) => [...e, `Überschriften: ${res.error}`]);
    report({
      id: aid("titel"),
      label,
      status: res.error ? "failed" : "done",
      detail: res.error ?? `${res.titles.length} Überschriften aus ${textBasis()}`,
    });
    setPendingTitles([]);
  };

  const generateBodies = async () => {
    const myRun = ++bodiesRun.current;
    setGenErrors([]);
    setPendingBodies(Array(BODY_TEMPLATE_COUNT).fill(true));
    // Alle fünf Slots leeren – die Antworten ersetzen ohnehin alles, und ein
    // alter Text unter einem Skelett sähe aus wie ein Ergebnis.
    onChange({ bodies: Array(BODY_TEMPLATE_COUNT).fill("") });
    const input = { business, roles, roleFreeText, place: value.place?.name ?? value.addressString, benefits };
    const label = named("Primärtexte");
    let written = 0;
    let failed = 0;
    report({ id: aid("texte"), label, status: "running", detail: `Mistral schreibt 0 von ${BODY_TEMPLATE_COUNT} aus ${textBasis()}…` });
    await Promise.all(
      Array.from({ length: BODY_TEMPLATE_COUNT }, async (_, i) => {
        const res = await generateBodyAction(input, i);
        if (bodiesRun.current !== myRun) return;
        if (res.body) {
          const body = res.body;
          written++;
          onChange((set) => ({ bodies: set.bodies.map((b, j) => (j === i ? body : b)) }));
        }
        if (res.error) {
          failed++;
          setGenErrors((e) => [...e, `Primärtext ${i + 1}: ${res.error}`]);
        }
        setPendingBodies((p) => p.map((v, j) => (j === i ? false : v)));
        const settled = written + failed;
        report({
          id: aid("texte"),
          label,
          status: settled < BODY_TEMPLATE_COUNT ? "running" : failed ? "failed" : "done",
          detail:
            settled < BODY_TEMPLATE_COUNT
              ? `Mistral schreibt ${settled} von ${BODY_TEMPLATE_COUNT} aus ${textBasis()}…`
              : failed
                ? `${failed} von ${BODY_TEMPLATE_COUNT} nicht geschrieben`
                : `${written} Primärtexte aus ${textBasis()}`,
        });
      }),
    );
  };

  const generateDescription = async () => {
    const myRun = ++descriptionRun.current;
    setPendingDescription(true);
    const label = named("Beschreibung");
    report({ id: aid("beschreibung"), label, status: "running", detail: "Mistral schreibt die Zeile unter der Überschrift…" });
    const res = await generateDescriptionAction({
      business,
      roles,
      roleFreeText,
      place: value.place?.name ?? value.addressString,
      benefits,
    });
    if (descriptionRun.current !== myRun) return;
    if (res.description) onChange({ description: res.description });
    if (res.error) setGenErrors((e) => [...e, `Beschreibung: ${res.error}`]);
    report({
      id: aid("beschreibung"),
      label,
      status: res.error ? "failed" : "done",
      detail: res.error ?? "eine Zeile unter der Überschrift",
    });
    setPendingDescription(false);
  };

  const anyGenerating =
    pendingBodies.some(Boolean) || pendingTitles.some(Boolean) || pendingDescription;
  const generateAll = () => {
    void generateBodies();
    void generateTitles();
    void generateDescription();
  };

  // Der Vorschlag füllt sich selbst: leere Texte beim ersten Anzeigen heißen
  // generieren, ohne dass jemand drei Knöpfe drückt. Nur einmal je Block, und
  // nur bei leeren Feldern – ein wiederhergestellter Entwurf behält seine Texte.
  const generated = useRef(false);
  useEffect(() => {
    if (!autoGenerate || generated.current) return;
    const empty = (xs: string[]) => xs.every((x) => !x.trim());
    if (!empty(value.bodies) || !empty(value.titles) || value.description.trim()) return;
    generated.current = true;
    generateAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate]);

  const uploads = useUploads(value.id);
  // Was schon da ist, darf das Regal nicht ein zweites Mal laden: Dateinamen
  // aus Anzeigen, Ablage und laufenden Uploads.
  const taken = useMemo(
    () =>
      new Set([
        ...value.ads.flatMap((a) => (a.type === "split" ? [a.portrait.fileName, a.square.fileName] : [a.asset.fileName])),
        ...value.loose.map((x) => x.fileName),
        ...uploads.map((u) => u.name),
      ]),
    [value.ads, value.loose, uploads],
  );

  // refresh=true nur beim Klick: der Cache soll beim Aufklappen weiter greifen,
  // aber wer aktualisiert, meint genau das.
  const refreshForms = async (refresh = false): Promise<LeadForm[]> => {
    setFormsLoading(true);
    const res = await listFormsAction(pageId, refresh);
    setForms(res.forms);
    setFormsError(res.error);
    setFormsLoading(false);
    return res.forms;
  };

  /**
   * Formular über seine ID holen und in die Liste einreihen – ausgewählt wird
   * es gleich mit, denn genau dafür wird die ID eingetippt.
   */
  const pullForm = async () => {
    setPulling(true);
    const res = await pullFormAction(pageId, formIdInput);
    setFormsError(res.error);
    const [form] = res.forms;
    if (form) {
      setForms((all) => [form, ...all.filter((f) => f.id !== form.id)]);
      onChange({ formId: form.id });
      setFormIdInput("");
    }
    setPulling(false);
  };

  // Beim Öffnen: laden, die IDs merken (das ist „vorher“ für die Erkennung),
  // und den Hinweis aus der Aufgabe abgleichen – ein eindeutiger Treffer wird
  // gewählt, mit Etikett.
  const seen = useRef<Set<string>>(undefined);
  const [detected, setDetected] = useState<{ name: string; how: "neu" | "hinweis" }>();
  useEffect(() => {
    if (!pageId) return;
    // Nur der erste Block meldet ins Protokoll – die weiteren Standorte lesen
    // dieselbe Liste derselben Seite.
    const label = "Lead-Formulare";
    if (primary) report({ id: "formulare", label, status: "running", detail: "liest die Formulare der Seite…" });
    void refreshForms().then((list) => {
      seen.current = new Set(list.map((f) => f.id));
      const hit = value.formId || !formHint ? undefined : matchFormHint(list, formHint);
      if (hit) {
        onChange({ formId: hit.id });
        setDetected({ name: hit.name, how: "hinweis" });
      }
      if (primary)
        report({
          id: "formulare",
          label,
          status: "done",
          detail: [
            plural(list.length, "Formular", "Formulare"),
            hit
              ? `„${hit.name}“ passt zum Hinweis „${formHint}“ – gewählt`
              : formHint && !value.formId
                ? `keins passt zu „${formHint}“ – bitte wählen`
                : undefined,
          ]
            .filter(Boolean)
            .join(" · "),
          source: hit ? "clickup" : undefined,
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Das Formular entsteht im Baukasten, in einem anderen Tab. Solange hier
  // keins gewählt ist: bei Rückkehr (focus) und alle 30 s nachlesen – dasselbe
  // Muster wie die Lead-TOS-Schleife in wizard.tsx. Das erste, das vorher
  // nicht da war, wird gewählt; danach ist Ruhe.
  const formId = value.formId;
  // Während refreshForms(true) läuft, kann von Hand gewählt werden – der Ref
  // ist bei jedem Render aktuell, die Prop formId (Closure) nicht.
  const formIdRef = useRef(formId);
  formIdRef.current = formId;
  useEffect(() => {
    if (!pageId || formId) return;
    const check = async () => {
      const before = seen.current;
      if (!before) return;
      const list = await refreshForms(true);
      if (formIdRef.current) return;
      const fresh = newlyAppeared(before, list);
      if (!fresh) return;
      onChange({ formId: fresh.id });
      setDetected({ name: fresh.name, how: "neu" });
      report({
        id: "formulare",
        label: "Lead-Formulare",
        status: "done",
        detail: `Neu erkannt: „${fresh.name}“ – gewählt`,
      });
    };
    const id = setInterval(check, 30_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, formId]);

  // Ein Formular gehört genau einer Seite. Wechselt der beworbene Kunde, zeigt
  // die getroffene Auswahl auf ein Formular einer fremden Seite – Meta nimmt
  // die Anzeige dann gar nicht erst an, und zwar erst beim Anlegen. Deshalb
  // beim Seitenwechsel zurücksetzen. Der erste Lauf zählt nicht: dort steht
  // die Seite zum ersten Mal fest, und ein wiederhergestellter Entwurf soll
  // sein Formular behalten.
  const knownPage = useRef(pageId);
  useEffect(() => {
    if (knownPage.current === pageId) return;
    knownPage.current = pageId;
    if (value.formId) onChange({ formId: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Laut Spec nur Bestätigung, keine Auswahl. Der Wert selbst reist nicht mehr
  // über diesen Block in den State: die Submission setzt ihn aus dem Kunden auf
  // jede Anzeigengruppe (wizard.tsx, onCreate) – ein Mount-Effekt hier erreichte
  // nur Blöcke, die auch aufgeklappt wurden.

  /**
   * Der ganze Ordner geht auf einmal los, und zwar außerhalb dieser Komponente:
   * upload-queue.ts überlebt jeden Schritt- und Seitenwechsel, dieser Block
   * nicht. Von hier bleibt nur das Anschauen – die Karten unten und der Toast
   * kommen aus demselben Store.
   */
  const onFiles = (files: Pickable[]) =>
    enqueue(files, { adSetId: value.id, adSetName: value.name, adAccount });

  /** Zwei liegengebliebene Hälften von Hand zusammenziehen. */
  const pairLoose = (aId: string, bId: string) => {
    const a = value.loose.find((x) => x.id === aId);
    const b = value.loose.find((x) => x.id === bId);
    if (!a || !b || a.id === b.id) return;
    const [portrait, square] = a.orientation === "portrait" ? [a, b] : [b, a];
    const taken = new Set(value.ads.map((x) => x.name));
    onChange({
      ads: [
        ...value.ads,
        {
          id: crypto.randomUUID(),
          name: nextCreativeName(taken),
          type: "split",
          portrait,
          square,
          warn: pairWarning(portrait, square),
        },
      ],
      loose: value.loose.filter((x) => x.id !== a.id && x.id !== b.id),
    });
  };

  /**
   * Eine liegengebliebene Datei auf eine Anzeige mit einem einzelnen Motiv
   * ziehen macht ein Paar daraus – aus UGC wie aus einem Einzelbild.
   */
  const pairWithAd = (adId: string, looseId: string) => {
    const ad = value.ads.find((a) => a.id === adId);
    const asset = value.loose.find((x) => x.id === looseId);
    if (!ad || (ad.type !== "ugc" && ad.type !== "single") || !asset) return;
    const [portrait, square] =
      ad.asset.orientation === "portrait" ? [ad.asset, asset] : [asset, ad.asset];
    const taken = new Set(value.ads.filter((a) => a.id !== adId).map((a) => a.name));
    onChange({
      ads: value.ads.map((a) =>
        a.id === adId
          ? detachAd({
              id: a.id,
              name: nextCreativeName(taken),
              source: a.source,
              type: "split",
              portrait,
              square,
              warn: pairWarning(portrait, square),
            })
          : a,
      ),
      loose: value.loose.filter((x) => x.id !== looseId),
    });
  };

  /**
   * Jede Zusammenlegung ist umkehrbar, und der Rückweg endet nie in einer
   * Sackgasse: was aus einer Anzeige herausfällt, findet über „Als eigene
   * Anzeige“ wieder hinein – Bild wie Video. Gerechnet wird in state.ts.
   */
  const dissolve = (adId: string) => onChange(dissolveAd(value, adId));
  const promote = (looseId: string) => onChange(promoteLoose(value, looseId));
  const swap = (adId: string) => onChange({ ads: swapPair(value.ads, adId) });

  /** Nach dem Zuschneiden: Ersatz in der Hälfte, oder ein Paar aus Original und Ausschnitt (state.ts). */
  const replaceLoose = (looseId: string, asset: WizardImageAsset) =>
    onChange(applyCrop(value, { looseId }, asset));

  const replaceAdAsset = (adId: string, slot: AssetSlot, asset: WizardImageAsset) =>
    onChange(applyCrop(value, { adId, slot }, asset));

  // Jede Änderung an einer geliehenen Anzeige löst die Verbindung – nur für
  // diese eine, die Quelle bleibt unberührt.
  const renameAd = (adId: string, name: string) =>
    onChange({
      ads: value.ads.map((a) => (a.id === adId ? detachAd({ ...a, name }) : a)),
    });

  const removeAd = (adId: string) =>
    onChange({ ads: value.ads.filter((a) => a.id !== adId) });

  const removeLoose = (looseId: string) =>
    onChange({ loose: value.loose.filter((x) => x.id !== looseId) });

  /** Inhalt aus einer anderen Anzeigengruppe leihen statt erneut hochzuladen. */
  const linkFrom = (sourceSetId: string) => {
    const src = otherAdSets.find((s) => s.id === sourceSetId);
    if (!src) return;
    const already = new Set(
      value.ads.filter((a) => a.source).map((a) => `${a.source!.adSetId}:${a.source!.adId}`),
    );
    const fresh = src.ads
      .filter((a) => !a.source && !already.has(`${src.id}:${a.id}`))
      .map((a): WizardAd => {
        const { id: _id, ...content } = a;
        return { ...content, id: crypto.randomUUID(), source: { adSetId: src.id, adId: a.id } };
      });
    if (fresh.length) onChange({ ads: [...value.ads, ...fresh] });
  };

  const linkable = otherAdSets.filter((s) => s.ads.some((a) => !a.source));
  // Statisch statt async: die Formulare sind schon geladen (refreshForms),
  // der Typeahead muss dafür nicht selbst nachfragen — daher debounceMs={0}
  // unten. keywords hängt die ID an, damit eine kopierte Formular-ID genauso
  // greift wie der Name (ersetzt HeroUIs defaultFilter).
  const formSearchSource = useMemo(
    () => createStaticSource(forms.map(toFormItem), { keywords: (item) => [item.auxiliaryData.id] }),
    [forms],
  );
  const selectedForm = value.formId ? (forms.find((f) => f.id === value.formId) ?? null) : null;
  const secondTextMissing = needsSecondText(value);
  const notices = checkCopy({
    bodies: value.bodies,
    titles: value.titles,
    description: value.description,
    business,
  });

  return (
    // 48 px zwischen den Abschnitten, ein Haarstrich dazwischen: vier
    // Abschnitte mit je einem Kopf brauchen Luft, sonst liest sich der Block
    // als eine Spalte gleich schwerer Felder.
    <div className="flex flex-col gap-12">
      {/* Dieselben offenen Punkte, die die Kopfzeile als Zahl trägt – hier
          ausgeschrieben, damit man nicht raten muss, welche gemeint sind. */}
      <FieldsetSection
        legend="Inhalt"
        // Rein informativ – die Auswahl passiert nicht hier, sondern folgt aus
        // der Seite des Kunden (siehe wizard.tsx). Fehlt das Instagram-Konto,
        // ist das kein Fehler: die Anzeige läuft dann nur über die Seite.
        satz={
          instagramUserId
            ? `Videos werden UGC-Anzeigen, Bilder finden ihr Paar. Läuft auf Facebook und auf Instagram als ${instagramLabel ?? `Instagram-ID ${instagramUserId}`}.`
            : "Videos werden UGC-Anzeigen, Bilder finden ihr Paar. Läuft nur über die Facebook-Seite — kein Instagram-Konto verbunden."
        }
      >
        <div className="w-full space-y-4">
        <DriveShelf
          business={business}
          folderId={driveFolderId}
          hint={[cityOf(value.addressString), ...roles]}
          taken={taken}
          onFiles={onFiles}
        />

        {/* Nicht gesperrt, solange etwas läuft: nachgelegte Dateien reihen sich
            ein. Wer zehn Videos hat, soll sie nicht in Schüben abpassen müssen. */}
        <FilePicker onFiles={onFiles} />

        {/* Früher stand hier ein roter Fehler und die Anzeigengruppe war
            blockiert, bis jede Datei einen Partner hatte. Ein Bild darf aber
            einzeln laufen – also ein Hinweis mit drei Wegen statt einer Sperre. */}
        {value.loose.length > 0 && (
          <Banner
            status="info"
            title={`${plural(value.loose.length, "Datei gehört", "Dateien gehören")} noch zu keiner Anzeige`}
            description="Gestrichelt umrandet. Im Menü der Kachel: als eigene Anzeige, mit einer anderen Datei paaren oder das fehlende Format dazu zuschneiden — Ziehen geht auch."
          />
        )}

        {/* Anzeigen, laufende Uploads und liegengebliebene Dateien in einem
            Raster und in dieser Reihenfolge: eine fertige Datei wird zur
            Anzeige und rückt damit genau an die Stelle vor, an der eben noch
            ihr Ring lief. */}
        {(value.ads.length > 0 || uploads.length > 0 || value.loose.length > 0) && (
          <div className="space-y-2">
            <p className="text-ink-500 text-xs tabular-nums">
              {[
                plural(value.ads.length, "Anzeige", "Anzeigen"),
                uploads.length > 0 && `${uploads.length} im Upload`,
                value.loose.length > 0 && `${value.loose.length} ohne Anzeige`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <ContentGrid>
              {value.ads.map((ad) => (
                <AdTile
                  key={ad.id}
                  ad={ad}
                  adAccount={adAccount}
                  borrowers={borrowersOfAd(ad.id)}
                  onDropAsset={(looseId) => pairWithAd(ad.id, looseId)}
                  onRename={(name) => renameAd(ad.id, name)}
                  onDissolve={() => dissolve(ad.id)}
                  onSwap={() => swap(ad.id)}
                  onRemove={() => removeAd(ad.id)}
                  onCropped={(slot, cropped) => replaceAdAsset(ad.id, slot, cropped)}
                />
              ))}
              {uploads.map((u) => (
                <UploadTile key={u.id} upload={u} />
              ))}
              {value.loose.map((asset) => (
                <LooseTile
                  key={asset.id}
                  asset={asset}
                  adAccount={adAccount}
                  partners={value.loose
                    .filter((o) => o.id !== asset.id && o.orientation !== asset.orientation)
                    .map((o) => ({ id: o.id, label: cleanStem(o.fileName) }))}
                  onPairWith={(draggedId) => pairLoose(draggedId, asset.id)}
                  onPromote={() => promote(asset.id)}
                  onCropped={(cropped) => replaceLoose(asset.id, cropped)}
                  onRemove={() => removeLoose(asset.id)}
                />
              ))}
            </ContentGrid>
          </div>
        )}

        {uploads.some((u) => u.error) && (
          <Banner
            status="error"
            title="Einige Uploads sind fehlgeschlagen"
            description={uploads
              .filter((u) => u.error)
              .map((u) => `${u.name}: ${u.error}`)
              .join(" · ")}
            // Fast immer die Leitung oder ein Wackler bei Meta – die Dateien
            // liegen noch hier, also braucht es dafür keinen zweiten Gang
            // durch den Dateidialog.
            endContent={
              <Button size="sm" variant="ghost" label="Fehlgeschlagene erneut versuchen" onClick={() => retryUploads(value.id)} />
            }
          />
        )}
        </div>

        {linkable.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            {/* Das ist eine Aktion, kein Wert: nach dem Klick ist der Inhalt
                übernommen und es gibt nichts, was das Feld weiter anzeigen
                könnte. Als <select> musste es sich nach jeder Wahl selbst
                zurücksetzen. */}
            <DropdownMenu
              button={{ label: "Inhalt übernehmen von…", variant: "secondary", size: "sm" }}
              items={linkable.map((s) => ({ label: s.name, onClick: () => linkFrom(s.id) }))}
            />
          </div>
        )}
      </FieldsetSection>

      {/* Alles nach dem Inhalt erst, wenn der Assistent fertig ist – mit dem
          Einzug eines Schritts, denn genau das ist es: der Rest der Seite
          kommt an. */}
      {stage === "alles" && (
        <div className="step-enter flex flex-col gap-12">
      <Divider />

      {/* Dieselben offenen Punkte, die die Kopfzeile als Zahl trägt – hier
          ausgeschrieben. Unter dem Inhalt, nicht darüber: die Meldung kommt
          mit dem Rest der Seite an und schiebt den Inhalt nicht weg. */}
      {blockers.length > 0 && (
        <Banner
          status="warning"
          title="Hier fehlt noch etwas"
          description={
            <ul className="list-disc space-y-1 pl-5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          }
        />
      )}

      <FieldsetSection
        legend="Standort und Umkreis"
        satz="Wo die Anzeigen ausgespielt werden — eine Adresse oder ein Ort, dazu der Umkreis."
      >
        <div className="w-full space-y-4">
          <TextInput
            label="Name der Anzeigengruppe"
            value={value.name}
            onChange={(name) => onChange({ name })}
            isRequired
            width="100%"
            className="max-w-xl"
          />

          <LocationField
            value={value}
            onChange={onChange}
            adAccount={adAccount}
          />
          <Herkunft source={locationSource} />
        </div>
      </FieldsetSection>

      <Divider />

      {/* Wessen Formulare das sind, steht in der Überschrift – ohne den
          Seitennamen sah die Liste des falschen Kunden genauso aus wie die
          richtige. */}
      <FieldsetSection
        legend="Lead-Formular"
        satz={`Das Formular der Seite ${pageName || "des Kunden"}, das sich aus der Anzeige öffnet. Ein in Meta neu gebautes wird hier erkannt und gewählt.`}
        action={
          <div className="flex items-center gap-1">
            {/* Ohne asset_id landet der Baukasten auf der Seite, die im Business
                Manager zuletzt offen war – in der Praxis MedArbeiter statt des
                Kunden. Lieber gar nicht anbieten als auf die falsche Seite. */}
            <Button
              variant="secondary"
              size="sm"
              isDisabled={!pageId}
              label="In Meta bauen"
              onClick={() => window.open(instantFormsUrl(pageId), "_blank")}
            />
            <Button
              variant="ghost"
              size="sm"
              label={formsLoading ? "Wird aktualisiert…" : "Aktualisieren"}
              onClick={() => refreshForms(true)}
              isDisabled={formsLoading || !pageId}
            />
          </div>
        }
      >
        <div className="w-full space-y-4">
        {/* Typeahead statt Select: eine Seite hat schnell dreißig Formulare mit
            fast gleichem Namen ("PDL Kampagne 03/26"), und die scrollt niemand
            durch. Gefiltert wird über Name und ID – die ID steht in Meta neben
            dem Formular und ist das einzige, was sich eindeutig kopieren lässt. */}
        <Typeahead
          label="Lead-Formular"
          isLabelHidden
          searchSource={formSearchSource}
          debounceMs={0}
          // HeroUIs ComboBox.Trigger öffnete die volle Liste ohne Tippen —
          // genau dafür ist dieses Feld gedacht (dreißig ähnlich benannte
          // Formulare durchklicken statt den Namen erst zu kennen). Ohne
          // hasEntriesOnFocus bliebe das Feld beim Fokussieren leer, bis
          // ein Zeichen getippt wird. maxMenuItems hoch genug für den
          // typischen Bestand, ohne unbegrenzt zu scrollen.
          hasEntriesOnFocus
          maxMenuItems={50}
          value={selectedForm ? toFormItem(selectedForm) : null}
          onChange={(item) => onChange({ formId: item ? item.id : "" })}
          isDisabled={!pageId}
          width="100%"
          className="max-w-xl"
          placeholder={
            !pageId
              ? "Erst den beworbenen Kunden wählen…"
              : formsLoading
                ? "Wird geladen…"
                : "Formular suchen oder auswählen…"
          }
          emptySearchResultsText="Kein Formular gefunden."
        />
        {detected && value.formId && (
          <Text type="supporting" as="p" aria-live="polite">
            {detected.how === "neu"
              ? `Neu erkannt: „${detected.name}“ – gerade in Meta gebaut.`
              : `Aus der Aufgabe gewählt: „${detected.name}“.`}
          </Text>
        )}
        {formsError && (
          <Banner status="error" title="Lead-Formulare konnten nicht geladen werden" description={formsError} />
        )}
        {/* Kein Fehler, aber auch keine Auswahl: die Seite hat schlicht noch
            kein Formular. Ohne diesen Hinweis wirkt das leere Feld wie ein Bug. */}
        {!formsError && !formsLoading && pageId && forms.length === 0 && (
          <Text type="supporting" as="div">
            {pageName || "Diese Seite"} hat noch kein Lead-Formular — erstelle eines in Meta und
            klicke dann auf Aktualisieren.
          </Text>
        )}

        {/* Der Weg an der Liste vorbei: ein gerade gebautes Formular steht in
            Metas Antwort manchmal minutenlang nicht drin, und mehr als 100
            passen ohnehin nicht hinein. Die ID steht im Baukasten neben dem
            Formularnamen; eine kopierte Adresszeile wird auch angenommen. */}
        <div className="flex max-w-xl items-end gap-2">
          <TextInput
            label="Formular nicht dabei? Per ID holen"
            value={formIdInput}
            onChange={setFormIdInput}
            isDisabled={!pageId || pulling}
            width="100%"
            className="flex-1"
            placeholder="z. B. 1234567890123456"
            // TextInput hat keine inputMode-Prop (BaseProps deckt keine nativen
            // Input-Attribute ab) — die numerische Tastatur auf Mobilgeräten
            // entfällt hier, keine funktionale Einbuße.
            onKeyDown={(e) => {
              // Enter im Assistenten schickt sonst den ganzen Schritt ab.
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (formIdInput.trim() && !pulling) pullForm();
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            label={pulling ? "Wird geholt…" : "Formular holen"}
            onClick={pullForm}
            isDisabled={!pageId || pulling || !formIdInput.trim()}
          />
        </div>
        </div>
      </FieldsetSection>

      <Divider />

      <FieldsetSection
        legend="Texte"
        satz="Aus Rollen, Standort und Benefits geschrieben. Jede Zeile lässt sich ändern, jede Gruppe neu schreiben."
        action={
          <Button
            variant="secondary"
            icon={<SparkleIcon size={16} weight="fill" />}
            label="Alle Texte neu schreiben"
            onClick={generateAll}
            isDisabled={anyGenerating}
          />
        }
      >
        {/* Vier Gruppen – Benefits, Primärtexte, Überschriften, Beschreibung –
            mit 40 px dazwischen und 16 px innerhalb: Zusammengehöriges eng,
            Getrenntes weit. Vorher stand alles im selben 16-px-Takt. */}
        <div className="flex w-full flex-col gap-10">
          <div className="max-w-2xl space-y-2">
            {/* Etikett und Herkunft in einer Zeile über dem Feld: die Herkunft
                gehört zum Namen des Werts, nicht unter den Kasten. */}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Text type="label" as="div">
                Benefits des Arbeitgebers
              </Text>
              <Herkunft source={benefitsSource} />
            </div>
            <TextArea
              label="Benefits des Arbeitgebers"
              isLabelHidden
              value={benefits}
              onChange={onBenefitsChange}
              rows={5}
              width="100%"
              placeholder={"z. B.\nWeihnachts- & Urlaubsgeld\n30 Urlaubstage\nJobRad"}
            />
            <Text type="supporting" as="p">
              Eine je Zeile – sie stehen wörtlich in allen Texten.
            </Text>
          </div>

          <TextListField
            label="Primärtexte"
            singular="Primärtext"
            values={value.bodies}
            limit={BODY_LIMIT}
            multiline
            pending={pendingBodies}
            action={
              <Button
                variant="ghost"
                size="sm"
                icon={<SparkleIcon size={14} weight="bold" />}
                label="Neu schreiben"
                onClick={generateBodies}
                isDisabled={pendingBodies.some(Boolean)}
              />
            }
            onChange={(bodies) => onChange({ bodies })}
          />
          <CopyNotices notices={notices} field="bodies" />
          {genErrors.length > 0 && (
            <Banner
              status="error"
              title="Einige Texte konnten nicht generiert werden"
              description={genErrors.join(" · ")}
            />
          )}

          {/* Meta lehnt eine UGC-Anzeige ab, bei der jedes Textfeld nur einen
              Eintrag hat – lieber hier sagen als mitten im Anlegen. */}
          {secondTextMissing && (
            <Banner
              status="warning"
              title="Zweiten Primärtext oder zweite Überschrift hinzufügen"
              description="Meta lehnt eine UGC-Anzeige ab, die von jedem nur einen hat. Split-Anzeigen sind davon nicht betroffen."
            />
          )}

          <TextListField
            label="Überschriften"
            singular="Überschrift"
            values={value.titles}
            limit={TITLE_LIMIT}
            pending={pendingTitles}
            action={
              <Button
                variant="ghost"
                size="sm"
                icon={<SparkleIcon size={14} weight="bold" />}
                label="Neu schreiben"
                onClick={generateTitles}
                isDisabled={pendingTitles.some(Boolean)}
              />
            }
            onChange={(titles) => onChange({ titles })}
          />
          <CopyNotices notices={notices} field="titles" />

          {/* Mehrzeilig wie die Primary texts: hier stehen Aufzählungen mit
              Zeilenumbrüchen ("✔ 30 Tage Urlaub …"), keine Schlagzeile. Der
              Zähler kam bei HeroUI manuell in Label — TextArea zeigt ihn über
              maxLength selbst an, der Titel bleibt also schlicht. */}
          <div role="group" aria-label="Beschreibung" className="max-w-2xl space-y-4">
            {/* Derselbe Kopf wie an den Listen: Name links, die leise Handlung rechts. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text type="label" as="div">
                Beschreibung
              </Text>
              <Button
                variant="ghost"
                size="sm"
                icon={<SparkleIcon size={14} weight="bold" />}
                label="Neu schreiben"
                onClick={generateDescription}
                isDisabled={pendingDescription}
              />
            </div>
            {pendingDescription ? (
              // In Feldhöhe (rows={6}), damit beim Eintreffen nichts springt.
              // width/height als Props, nicht als Klassen – siehe TextListField.
              <div className="ki-schimmer space-y-2" aria-label="Beschreibung wird generiert…">
                {["40%", "60%", "50%", "60%", "80%"].map((w, i) => (
                  <Skeleton key={i} height={14} width={w} radius={1} index={i} />
                ))}
              </div>
            ) : (
              <TextArea
                label="Beschreibung"
                isLabelHidden
                value={value.description}
                onChange={(description) => onChange({ description })}
                rows={6}
                maxLength={DESCRIPTION_LIMIT}
                width="100%"
              />
            )}
            <CopyNotices notices={notices} field="description" />
          </div>
        </div>
      </FieldsetSection>

      <Divider />

      {/* Ganz unten und nur als Umriss: das Entfernen ist die seltenste Aktion
          hier und stand vorher als erstes in der Kopfzeile. */}
      <Toolbar
        label="Anzeigengruppe"
        startContent={
          <Button variant="secondary" label="Standort entfernen" onClick={onRemove} isDisabled={!canRemove} />
        }
      />
        </div>
      )}
    </div>
  );
}
