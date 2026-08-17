"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Banner,
  Button,
  createStaticSource,
  Divider,
  DropdownMenu,
  Text,
  TextArea,
  TextInput,
  Toolbar,
  Tooltip,
  Typeahead,
  type SearchableItem,
} from "@astryxdesign/core";
import { PlusIcon, SparkleIcon, XIcon } from "@phosphor-icons/react";
import type { LeadForm } from "@/lib/forms";
import { instantFormsUrl } from "@/lib/forms";
import { nextCreativeName } from "@/lib/media";
import { fillTitles, freeTitleSlots, roleWord } from "@/lib/headlines";
import { HeadlineDialog } from "./headline-dialog";
import { plural } from "@/lib/labels";
import { LocationField } from "./location-field";
import { checkCopy, type CopyField, type Notice } from "@/lib/copy";
import { enqueue, retryUploads, useUploads } from "./upload-queue";
import { AdTile, ContentGrid, LooseTile, UploadTile, type AssetSlot } from "./content-grid";
import {
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
import { listFormsAction, pullFormAction } from "../actions";

const BODY_LIMIT = 4399;
const TITLE_LIMIT = 255;
const DESCRIPTION_LIMIT = 1500;
const MAX_ITEMS = 5;

/** Was der Browser an Dateien annimmt – der Route Handler lehnt alles andere ab. */
const ACCEPT = "video/*,image/jpeg,image/png";

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
function FilePicker({ onFiles }: { onFiles: (files: FileList) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="border-line bg-surface-secondary flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-dashed p-4">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        tabIndex={-1}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button variant="secondary" label="Dateien wählen" onClick={() => input.current?.click()} />
      {/* Warum das Warten manchmal länger dauert, und warum Fotos immer zu
          zweit auftreten müssen. */}
      <Text type="supporting" as="div" className="min-w-0 flex-1">
        Videos werden von allein zu UGC-Anzeigen. Fotos werden 9:16 + 1:1 gepaart — passende
        Nummern („Creative 3“, „Creative 4“) werden automatisch gepaart, alles andere ziehst du
        selbst zusammen. iPhone- und Schnittexporte (HEVC, ProRes) werden vor dem Upload zu
        H.264/MP4 konvertiert.
      </Text>
    </div>
  );
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
 * Der Knopf über den Überschriften – grau, solange keine Rolle feststeht.
 *
 * Ohne Rolle bleiben von den Vorschlägen nur die neutralen Zeilen übrig (siehe
 * lib/headlines.ts): „Wir suchen dich“, für jede Kampagne dieselben. Das fällt
 * erst auf, wenn der Dialog schon offen ist und zwanzig austauschbare Zeilen
 * zeigt – also gar nicht erst anbieten.
 *
 * Ein grauer Knopf sagt allerdings nur, dass hier nichts geht, nicht warum. Die
 * Rollen stehen einen Schritt weiter hinten, also genau dort, wo sie hier
 * niemand vermutet: deshalb der Tooltip, und darin der Weg dorthin statt nur
 * der Ortsangabe. Astryx' Tooltip bringt dafür eine eigene Hover-Brücke mit
 * (kein React Aria mehr darunter) — der Zeiger darf vom Rahmen zum Knopf im
 * Tooltip wandern, ohne dass der Tooltip vorher schließt.
 */
function GenerateTitlesButton({
  hasRole,
  onGenerate,
  onEditRoles,
}: {
  hasRole: boolean;
  onGenerate: () => void;
  onEditRoles: () => void;
}) {
  if (hasRole)
    return (
      <Button
        variant="secondary"
        size="sm"
        icon={<SparkleIcon size={14} weight="bold" />}
        label="Überschriften generieren"
        onClick={onGenerate}
      />
    );
  return (
    <Tooltip
      placement="above"
      content={
        <div className="flex max-w-64 flex-col items-center gap-2 text-center break-normal">
          <p>
            Ohne gesuchte Rolle bleiben nur allgemeine Vorschläge — „Pflegefachkraft (m/w/d)
            gesucht“ braucht die Rolle aus Schritt 3.
          </p>
          <Button variant="ghost" size="sm" label="Rollen wählen" onClick={onEditRoles} />
        </div>
      }
    >
      {/* Der Tooltip hängt am Rahmen, nicht am Knopf: ein <button disabled>
          verschluckt Hover und Fokus, der Hinweis bliebe genau dann aus, wenn
          er gebraucht wird. Ein span mit tabIndex={0} trägt Hover und Fokus
          stattdessen; pointer-events-none am Knopf gibt die Fläche an den
          Rahmen weiter – sonst greift der Hover nur auf dem Haarrand daneben. */}
      <span tabIndex={0} className="inline-flex rounded-xl">
        <Button
          variant="secondary"
          size="sm"
          isDisabled
          className="pointer-events-none"
          icon={<SparkleIcon size={14} weight="bold" />}
          label="Überschriften generieren"
        />
      </span>
    </Tooltip>
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
  onChange: (values: string[]) => void;
}) {
  const update = (i: number, v: string) =>
    onChange(values.map((val, idx) => (idx === i ? v : val)));
  const add = () => onChange([...values, ""]);
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div role="group" aria-label={labelText} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text type="label" as="div">
          {labelText}{" "}
          <span className="text-ink-500 font-normal tabular-nums">
            {values.length}/{MAX_ITEMS}
          </span>
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          {action}
          <Button
            variant="secondary"
            size="sm"
            icon={<PlusIcon size={14} weight="bold" />}
            label={`${singular} hinzufügen`}
            onClick={add}
            isDisabled={values.length >= MAX_ITEMS}
          />
        </div>
      </div>

      {/* Rand statt Vorgabe-Innenpolster: der Fokusring liegt außerhalb des
          Feldrands und würde am Rand des Scrollbereichs sonst abgeschnitten. */}
      <div className="scroll-fade max-h-[32rem] px-0.5 py-1">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {values.map((v, i) => (
            <div key={i} className="min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
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
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  icon={<XIcon size={14} weight="bold" />}
                  label={`${singular} ${i + 1} entfernen`}
                  onClick={() => remove(i)}
                  isDisabled={values.length === 1}
                />
              </div>
              {multiline ? (
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
function FieldsetSection({ legend, children }: { legend: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex shrink grow basis-0 flex-col gap-6">
      <legend className="w-full">
        <Text type="large" weight="medium" as="span">
          {legend}
        </Text>
      </legend>
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
  onEditRoles,
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
   * Die gesuchten Rollen aus Schritt 3 – sie stehen in den Überschriftenvorschlägen.
   * Seit Anzeigen vor Details liegen, sind sie hier meist noch leer; der
   * Generator kommt damit zurecht und schlägt dann allgemeiner vor.
   */
  roles: string[];
  roleFreeText?: string;
  /** Was hier noch fehlt (adSetBlockers) – dieselbe Liste, die die Kopfzeile zählt. */
  blockers: string[];
  /** Andere Anzeigengruppen dieser Kampagne, aus denen geliehen werden kann. */
  otherAdSets: { id: string; name: string; ads: WizardAd[] }[];
  borrowersOfAd: (adId: string) => string[];
  /** Springt zur Rollenauswahl in Schritt 3 – siehe GenerateTitlesButton. */
  onEditRoles: () => void;
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
  const [generating, setGenerating] = useState(false);
  const uploads = useUploads(value.id);

  // refresh=true nur beim Klick: der Cache soll beim Aufklappen weiter greifen,
  // aber wer aktualisiert, meint genau das.
  const refreshForms = async (refresh = false) => {
    setFormsLoading(true);
    const res = await listFormsAction(pageId, refresh);
    setForms(res.forms);
    setFormsError(res.error);
    setFormsLoading(false);
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

  // Beim Öffnen des Blocks direkt laden, nicht erst nach Klick auf Refresh –
  // gerade der Fehlende-Rechte-Fehler soll sofort sichtbar sein.
  useEffect(() => {
    if (pageId) refreshForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

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

  // Laut Spec nur Bestätigung, keine Auswahl – aber buildCreative() braucht den
  // Wert im State, sonst kommt er nie in der Kampagne an.
  useEffect(() => {
    if (instagramUserId && value.instagramUserId !== instagramUserId) {
      onChange({ instagramUserId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instagramUserId]);

  /**
   * Der ganze Ordner geht auf einmal los, und zwar außerhalb dieser Komponente:
   * upload-queue.ts überlebt jeden Schritt- und Seitenwechsel, dieser Block
   * nicht. Von hier bleibt nur das Anschauen – die Karten unten und der Toast
   * kommen aus demselben Store.
   */
  const onFiles = (files: FileList) =>
    enqueue([...files], { adSetId: value.id, adSetName: value.name, adAccount });

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

  /** Nach dem Zuschneiden steht ein neues Bild an derselben Stelle. */
  const replaceLoose = (looseId: string, asset: WizardImageAsset) =>
    onChange({
      loose: value.loose.map((x) => (x.id === looseId ? { ...asset, id: x.id } : x)),
    });

  const replaceAdAsset = (adId: string, slot: AssetSlot, asset: WizardImageAsset) =>
    onChange({
      ads: value.ads.map((a) => (a.id === adId ? detachAd({ ...a, [slot]: asset } as WizardAd) : a)),
    });

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
    <div className="space-y-8">
      {/* Dieselben offenen Punkte, die die Kopfzeile als Zahl trägt – hier
          ausgeschrieben, damit man nicht raten muss, welche gemeint sind. */}
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

      <FieldsetSection legend="Inhalt">
        {/* Rein informativ – die Auswahl passiert nicht hier, sondern folgt aus
            der Seite des Kunden (siehe wizard.tsx). Fehlt das Instagram-Konto,
            ist das kein Fehler: die Anzeige läuft dann nur über die Seite. */}
        <Text type="supporting" as="div">
          {instagramUserId
            ? `Wird auf Instagram als ${instagramLabel ?? `Instagram-ID ${instagramUserId}`} veröffentlicht`
            : "Nur Facebook-Seite — kein Instagram-Konto verbunden"}
        </Text>
        <div className="w-full space-y-4">
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
            description="Unten gestrichelt umrandet: als einzelne Anzeige verwenden, auf eine andere Datei ziehen (ergibt ein Paar) oder auf eine bestehende Anzeige ziehen, um ihr ein zweites Format zu geben."
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

      <Divider />

      <FieldsetSection legend="Standort und Umkreis">
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
        </div>
      </FieldsetSection>

      <Divider />

      {/* Wessen Formulare das sind, steht in der Überschrift – ohne den
          Seitennamen sah die Liste des falschen Kunden genauso aus wie die
          richtige. */}
      <FieldsetSection
        legend={
          <>
            Lead-Formular {pageName && <span className="text-ink-500">· {pageName}</span>}
          </>
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

        <div className="flex items-center gap-2 pt-1">
          {/* Ohne asset_id landet der Baukasten auf der Seite, die im Business
              Manager zuletzt offen war – in der Praxis MedArbeiter statt des
              Kunden. Lieber gar nicht anbieten als auf die falsche Seite. */}
          <Button
            variant="secondary"
            size="sm"
            isDisabled={!pageId}
            label="Formular in Meta erstellen"
            onClick={() => window.open(instantFormsUrl(pageId), "_blank")}
          />
          <Button
            variant="secondary"
            size="sm"
            label={formsLoading ? "Wird aktualisiert…" : "Aktualisieren"}
            onClick={() => refreshForms(true)}
            isDisabled={formsLoading || !pageId}
          />
        </div>
      </FieldsetSection>

      <Divider />

      <FieldsetSection legend="Texte">
        <div className="w-full space-y-4">
          <TextListField
            label="Primärtexte"
            singular="Primärtext"
            values={value.bodies}
            limit={BODY_LIMIT}
            multiline
            onChange={(bodies) => onChange({ bodies })}
          />
          <CopyNotices notices={notices} field="bodies" />

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
            action={
              <GenerateTitlesButton
                hasRole={Boolean(roleWord(roles, roleFreeText))}
                onGenerate={() => setGenerating(true)}
                onEditRoles={onEditRoles}
              />
            }
            onChange={(titles) => onChange({ titles })}
          />
          <CopyNotices notices={notices} field="titles" />

          <HeadlineDialog
            isOpen={generating}
            onOpenChange={setGenerating}
            business={business}
            roles={roles}
            roleFreeText={roleFreeText}
            taken={value.titles}
            free={freeTitleSlots(value.titles, MAX_ITEMS)}
            onApply={(picked) =>
              onChange({ titles: fillTitles(value.titles, picked, MAX_ITEMS) })
            }
          />

          {/* Mehrzeilig wie die Primary texts: hier stehen Aufzählungen mit
              Zeilenumbrüchen ("✔ 30 Tage Urlaub …"), keine Schlagzeile. Der
              Zähler kam bei HeroUI manuell in Label — TextArea zeigt ihn über
              maxLength selbst an, der Titel bleibt also schlicht. */}
          <TextArea
            label="Beschreibung"
            value={value.description}
            onChange={(description) => onChange({ description })}
            rows={6}
            maxLength={DESCRIPTION_LIMIT}
            width="100%"
            className="max-w-2xl"
          />
          <CopyNotices notices={notices} field="description" />
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
  );
}
