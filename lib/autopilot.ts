/**
 * Der Autopilot: was der Assistent im Browser Schritt für Schritt tut, einmal
 * ohne Browser – für jede ClickUp-Aufgabe im Status „kampagne anlegen“, die
 * eine Minute lang niemand mehr angefasst hat. Jede Minute ein Durchlauf
 * (instrumentation.ts, nur mit AUTOPILOT=1): Auftrag lesen, Kunde und Seite
 * finden, Lead-Formular wählen, Drive-Ordner hochladen und paaren, Umkreis
 * anpassen, Texte schreiben, pausiert anlegen, Kommentar mit Link zum Prüfen.
 * Den Status lässt er stehen: „abnahme kampagne“ setzt, wer die Kampagne
 * geprüft hat, nicht der Automat.
 *
 * Was der Wizard einer Person überlässt (mehrdeutiger Kunde, kein Formular-
 * Hinweis, leerer Ordner), hält hier an und schreibt einen Kommentar an die
 * Aufgabe, warum – sie bleibt im Status, und jemand legt sie wie bisher über
 * den Assistenten an. Der Marker im Kommentar sagt beim nächsten Durchlauf,
 * dass sie schon dran war; wird die Aufgabe danach geändert, ist sie wieder
 * dran.
 */
import { BODY_TEMPLATE_COUNT, generateBody, generateDescription, generateTitles, type BodiesInput } from "./bodies";
import { assembleBrief, type AssembledBrief } from "./brief";
import { adsManagerUrl } from "./campaigns";
import { addComment, listComments, listOpenBriefs } from "./clickup";
import { clients, fuzzyCustomerMatch, listCustomers, payers, resolveClientByName, type Customer } from "./customers";
import { bestLanding, download, findFolders, isMedia, landingAt, type DriveFile } from "./drive";
import { listLeadForms, matchFormHint, type LeadForm } from "./forms";
import { estimateReach, fitReachRadius } from "./geo-search";
import { readHeadline } from "./headline";
import { launch, type AdInput, type FormatAsset, type Receipt } from "./launch";
import { resolveLaunch, type WizardSubmission } from "./launch-request";
import { normalizeAdName, nextCreativeName, orientationOf, planAds, uniqueName, type Classified } from "./media";
import { adSetName, campaignName, initialsOf } from "./naming";
import { uploadImage, uploadVideo, videoThumbnail } from "./uploads";

export const MARKER = "[One Autopilot]";
/** Der Anfang des Erfolgskommentars – eine so markierte Aufgabe ist für immer erledigt, egal was danach geändert wird. */
export const DONE = `${MARKER} Kampagne angelegt`;
export const TICK_MS = 60_000;
/** Eine Aufgabe, die gerade erst geändert wurde, ist vielleicht noch nicht fertig beschrieben. */
export const SETTLE_MS = 60_000;
// Dieselben Hausstandards wie app/campaigns/new/state.ts – das ist ein
// Client-Modul, dessen Exporte hier nicht importierbar sind.
const DEFAULT_DAILY_BUDGET = 17;
/** Instagrams Minimum – nur der Browser skaliert hoch (lib/transcode.ts). */
const MIN_EDGE = 500;
/** Größere Bilder gehen nicht als Base64 an Mistral; die Paarung fällt dann auf Namen zurück. */
const HEADLINE_MAX_BYTES = 3_000_000;

/** „Mühlgasse 24, 71272 Renningen“ → „Renningen“ (Kopie von state.ts, Client-Modul). */
const cityOf = (addressString: string): string => {
  const m = /\b\d{5}\s+([^,]+)/.exec(addressString);
  return (m?.[1] ?? addressString.split(",").pop() ?? addressString).trim();
};

export type Asset = Classified & { format: FormatAsset };
export type Texts = { bodies: string[]; titles: string[]; description: string };
/**
 * Entweder angelegt oder nicht – und in beiden Fällen `notes`: alles, was
 * unterwegs nicht ging oder ausgelassen wurde, mit Grund. Der Kommentar an
 * der Aufgabe zählt es vollständig auf, damit niemand nachforschen muss.
 */
export type Outcome =
  | { halts: string[]; notes: string[] }
  | { campaignId: string; campaignName: string; adAccount: string; notes: string[] };

export type AutopilotDeps = {
  assembleBrief: (taskId: string) => Promise<AssembledBrief>;
  listCustomers: () => Promise<{ customers: Customer[] }>;
  listLeadForms: (pageId: string) => Promise<LeadForm[]>;
  fitRadius: (adAccount: string, addressString: string) => Promise<{ radiusKm: number; enough: boolean }>;
  driveMedia: (brief: AssembledBrief, clientName: string, hint: string[]) => Promise<{ path: string; files: DriveFile[] }>;
  /** undefined heißt: bewusst ausgelassen (zu klein) – kein Fehler. */
  upload: (file: DriveFile, adAccount: string) => Promise<Asset | undefined>;
  texts: (input: BodiesInput) => Promise<Texts>;
  launch: (submission: WizardSubmission) => Promise<Receipt | { error: string }>;
  now: () => Date;
};

const causeOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const realDeps: AutopilotDeps = {
  assembleBrief: (taskId) => assembleBrief(taskId),
  listCustomers,
  listLeadForms: (pageId) => listLeadForms(pageId),
  async fitRadius(adAccount, addressString) {
    const { radiusKm, enough } = await fitReachRadius((radiusKm) => estimateReach(adAccount, { addressString, radiusKm }));
    return { radiusKm, enough };
  },
  async driveMedia(brief, clientName, hint) {
    const folderId = brief.driveFolderId?.value;
    const landed = folderId ? await landingAt(folderId, hint) : (await bestLanding(await findFolders(clientName), undefined, hint)).landed;
    return { path: landed?.path.map((p) => p.name).join(" › ") ?? "", files: landed?.entries.filter(isMedia) ?? [] };
  },
  async upload(f, adAccount) {
    if (f.mimeType.startsWith("video/")) {
      const { width = 0, height = 0 } = f.videoMediaMetadata ?? {};
      if (width && height && Math.min(width, height) < MIN_EDGE) return undefined;
      const videoId = await uploadVideo(
        { name: f.name, size: Number(f.size), read: async (from, to) => (await download(f.id, { from, to })).blob() },
        adAccount,
      );
      const format: FormatAsset = { kind: "video", videoId, thumbnailUrl: await videoThumbnail(videoId), fileName: f.name };
      return { fileName: f.name, kind: "video", orientation: orientationOf(width, height), format };
    }
    const blob = await (await download(f.id)).blob();
    const { width = 0, height = 0 } = f.imageMediaMetadata ?? {};
    const [hash, headline] = await Promise.all([
      uploadImage(new File([blob], f.name, { type: f.mimeType }), adAccount),
      blob.size <= HEADLINE_MAX_BYTES ? readHeadline(new Blob([blob], { type: f.mimeType })) : undefined,
    ]);
    return { fileName: f.name, kind: "image", orientation: orientationOf(width, height), headline, format: { kind: "image", hash, fileName: f.name } };
  },
  async texts(input) {
    const [bodies, titles, description] = await Promise.all([
      Promise.all(Array.from({ length: BODY_TEMPLATE_COUNT }, (_, i) => generateBody(input, i).catch(() => ""))),
      generateTitles(input),
      generateDescription(input).catch(() => ""),
    ]);
    return { bodies: bodies.filter(Boolean), titles, description };
  },
  // Dasselbe wie app/api/launch, ohne Strom: prüfen, PBIA eintragen, anlegen.
  async launch(input) {
    const resolved = await resolveLaunch(input);
    if ("error" in resolved) return resolved;
    const plan = {
      ...input,
      ...resolved,
      adSets: input.adSets.map((s) => (s.instagramUserId ? s : { ...s, instagramUserId: resolved.instagramUserId })),
    };
    return launch(plan);
  },
  now: () => new Date(),
};

/** Aus geplanten Paaren und Videos die Anzeigen mit Namen – wie withArrivedAssets() im Wizard. */
export function adsFrom(assets: Asset[]): { ads: AdInput[]; unpaired: string[] } {
  const { ads: planned, unpaired } = planAds(assets);
  const taken = new Set<string>();
  const ads = planned.map((p): AdInput => {
    if (p.type === "ugc") {
      const name = uniqueName(normalizeAdName(p.asset.fileName), taken);
      taken.add(name);
      return { name, type: "ugc", asset: p.asset.format as Extract<FormatAsset, { kind: "video" }> };
    }
    const name = nextCreativeName(taken);
    taken.add(name);
    return { name, type: "split", portrait: p.portrait.format, square: p.square.format };
  });
  return { ads, unpaired: unpaired.map((a) => a.fileName) };
}

/**
 * Eine Aufgabe, von vorn bis zur angelegten Kampagne. Die billigen Prüfungen
 * (Kunde, Standort, Stellen, Formular) laufen alle, bevor irgendetwas
 * angehalten wird – der Kommentar soll jeden Grund nennen, nicht nur den
 * ersten. Drive und Meta kommen erst danach dran.
 */
export async function autopilotTask(taskId: string, deps: AutopilotDeps = realDeps): Promise<Outcome> {
  const brief = await deps.assembleBrief(taskId);
  const notes = [...brief.warnings];
  const halts: string[] = [];
  const { customers } = await deps.listCustomers();

  // Kunde: exakt, sonst der eine unscharfe Treffer – wie im Wizard.
  const name = brief.clientName?.value ?? "";
  const pool = clients(customers);
  const exact = resolveClientByName(pool, name);
  const fuzzy = exact ? [] : pool.filter((c) => fuzzyCustomerMatch(c.name, name));
  const client = exact ?? (fuzzy.length === 1 ? fuzzy[0] : undefined);
  if (!client?.page)
    halts.push(
      name
        ? `Kunde: „${name}“ steht nicht eindeutig in der Meta-Kundenliste${fuzzy.length ? ` (${fuzzy.map((c) => c.name).join(", ")})` : ""}.`
        : "Kunde: die Aufgabe nennt keinen.",
    );
  const adAccount = (customers.find((c) => c.id === "medarbeiter") ?? payers(customers)[0])?.adAccounts[0]?.id;
  if (!adAccount) halts.push("Werbekonto: keins im Portfolio.");

  const locations = brief.locations?.value ?? [];
  if (!locations.length) halts.push("Standort: keiner in Aufgabe, Onboarding oder Kundenübersicht gefunden.");
  const roles = brief.roles?.value ?? [];
  const roleFreeText = brief.roleFreeText?.value ?? "";
  if (!roles.length && !roleFreeText) halts.push("Gesuchte Stellen: keine gefunden.");
  const spendCapEuros = brief.spendCapEuros?.value;
  if (spendCapEuros !== undefined && spendCapEuros < 100) halts.push(`Ausgabenlimit: ${spendCapEuros} € liegt unter Metas Minimum von 100 €.`);
  if (!brief.benefits?.value?.trim()) notes.push("Benefits: keine gefunden – die Texte nennen keine.");
  if (!brief.dailyBudgetEuros) notes.push(`Tagesbudget: keins in der Aufgabe – Hausstandard ${DEFAULT_DAILY_BUDGET} €.`);

  // Formular: der Hinweis aus der Aufgabe, sonst das einzige der Seite. Passt
  // nichts eindeutig, nimmt das erste der Seite den Platz ein – die Kampagne
  // ist pausiert, und wer prüft, tauscht es über „Bearbeiten“ aus. Neun von
  // zehn Aufgaben nennen kein Formular; daran darf der Lauf nicht scheitern.
  // Nur ohne ein einziges Formular geht nichts: Meta verlangt an jeder
  // Lead-Anzeige eins.
  let form: LeadForm | undefined;
  if (client?.page) {
    const forms = await deps.listLeadForms(client.page.id);
    const hint = brief.formHint?.value;
    form = hint ? matchFormHint(forms, hint) : forms.length === 1 ? forms[0] : undefined;
    if (!form && !forms.length) halts.push("Lead-Formular: die Seite hat keins – eins im Baukasten anlegen.");
    else if (!form) {
      form = forms[0];
      notes.push(
        `${hint ? `Lead-Formular: keins passt eindeutig zu „${hint}“` : `Lead-Formular: die Seite hat ${forms.length} und die Aufgabe nennt keins`} – vorläufig „${form.name}“, beim Prüfen setzen.`,
      );
    }
  }
  if (halts.length || !client?.page || !adAccount || !form) return { halts, notes };

  // Medien: der Ordner, den auch das Drive-Regal öffnen würde, komplett.
  const { path, files } = await deps.driveMedia(brief, name || client.name, [cityOf(locations[0]), ...roles]);
  if (!files.length) return { halts: [`Medien: keine Videos oder Bilder in Drive gefunden (${path || "kein Kundenordner"}).`], notes };
  const assets: Asset[] = [];
  for (const f of files) {
    try {
      const asset = await deps.upload(f, adAccount);
      if (asset) assets.push(asset);
      else notes.push(`Datei ausgelassen: ${f.name} – unter Instagrams Minimum von ${MIN_EDGE} px.`);
    } catch (e) {
      notes.push(`Datei nicht hochgeladen: ${f.name} – ${causeOf(e)}`);
    }
  }
  const { ads, unpaired } = adsFrom(assets);
  for (const u of unpaired) notes.push(`Bild ohne Partner: ${u} – kein Hoch-/Querformat-Paar gefunden, nicht verwendet.`);
  if (!ads.length) return { halts: [`Medien: aus ${files.length} Dateien in „${path}“ entstand keine Anzeige.`], notes };

  // Je Standort eine Gruppe mit denselben Anzeigen, eigenem Umkreis und eigenen Texten.
  const adSets: WizardSubmission["adSets"] = [];
  for (const [i, addressString] of locations.entries()) {
    const city = cityOf(addressString);
    let radiusKm = brief.radiusKm?.value;
    if (radiusKm === undefined) {
      const fit = await deps.fitRadius(adAccount, addressString);
      radiusKm = fit.radiusKm;
      if (!fit.enough) notes.push(`Umkreis ${city}: auch bei ${radiusKm} km unter 150 000 Menschen – Ort prüfen.`);
    }
    const texts = await deps.texts({
      business: client.name,
      roles,
      roleFreeText,
      place: addressString,
      benefits: brief.benefits?.value ?? "",
      instructions: brief.copyInstructions,
    });
    if (!texts.bodies.length || !texts.titles.length) return { halts: [`Texte ${city}: Mistral hat keine Primärtexte oder Überschriften geschrieben.`], notes };
    if (texts.bodies.length < BODY_TEMPLATE_COUNT) notes.push(`Texte ${city}: nur ${texts.bodies.length} von ${BODY_TEMPLATE_COUNT} Primärtexten geschrieben.`);
    if (!texts.description) notes.push(`Texte ${city}: keine Beschreibung geschrieben.`);
    adSets.push({ name: adSetName(i, city), addressString, radiusKm, formId: form.id, ...texts, ads });
  }

  const initials = initialsOf(brief.assigneeName ?? "");
  if (!initials) notes.push("Kürzel: die Aufgabe ist niemandem zugewiesen – der Kampagnenname trägt keins.");
  const submission: WizardSubmission = {
    clientId: client.id,
    adAccount,
    campaignName: campaignName({ business: client.name, roles, roleFreeText, start: deps.now(), initials }),
    dailyBudgetCents: Math.round((brief.dailyBudgetEuros?.value ?? DEFAULT_DAILY_BUDGET) * 100),
    ...(spendCapEuros !== undefined && { spendCapCents: Math.round(spendCapEuros * 100) }),
    adSets,
  };
  const receipt = await deps.launch(submission);
  if ("error" in receipt) return { halts: [`Meta: ${receipt.error}`], notes };
  if (!receipt.campaignId) return { halts: [`Meta: ${receipt.adSets[0]?.error ?? "keine Kampagne angelegt."}`], notes };
  for (const s of receipt.adSets) if (s.error) notes.push(`Anzeigengruppe nicht angelegt: ${s.name} – ${s.error}`);
  for (const f of receipt.failed) notes.push(`Anzeige nicht angelegt: ${f.adName} in ${f.adSetName} – ${f.error}`);
  return { campaignId: receipt.campaignId, campaignName: submission.campaignName, adAccount, notes };
}

/** Die eigene Adresse, für den Prüf-Link – aus der Rückkehr-URL des Logins, ohne eigene Variable. */
const origin = () => {
  try {
    return new URL(process.env.MEDARBEITER_REDIRECT_URI ?? "").origin;
  } catch {
    return "";
  }
};

export function commentFor(outcome: Outcome, base = origin()): string {
  const notes = outcome.notes.length ? ["", "Nicht erledigt oder ausgelassen:", ...outcome.notes.map((n) => `– ${n}`)] : [];
  if ("halts" in outcome)
    return [
      `${MARKER} Kampagne nicht automatisch angelegt.`,
      "Woran es hängt:",
      ...outcome.halts.map((h) => `– ${h}`),
      ...notes,
      "",
      `Aufgabe ergänzen (dann versucht es der Autopilot erneut) oder über den Assistenten anlegen: ${base}/campaigns/new`,
    ].join("\n");
  return [
    `${DONE} (pausiert): ${outcome.campaignName}`,
    `Prüfen: ${base}/campaigns/${outcome.campaignId}`,
    `Ads Manager: ${adsManagerUrl(outcome.adAccount, outcome.campaignId)}`,
    ...notes,
  ].join("\n");
}

/**
 * Schon dran gewesen? Eine angelegte Kampagne zählt für immer – die Aufgabe
 * behält ihren Status, und eine spätere Änderung darf keine zweite Kampagne
 * anlegen. Ein Halt zählt nur, bis die Aufgabe wieder geändert wird.
 */
export const alreadyHandled = (comments: { text: string; date: number }[], updatedAt: number): boolean =>
  comments.some((c) => c.text.startsWith(DONE) || (c.text.includes(MARKER) && c.date >= updatedAt));

// ponytail: ein Lauf zur Zeit, Aufgaben nacheinander – bei ~200 Kunden kommen
// am Tag eine Handvoll Aufträge, nicht Dutzende pro Minute.
let running = false;
export async function autopilotTick(deps: AutopilotDeps = realDeps, log: Pick<Console, "log" | "error"> = console): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const brief of await listOpenBriefs()) {
      if (Date.now() - brief.updatedAt < SETTLE_MS) continue;
      if (alreadyHandled(await listComments(brief.taskId), brief.updatedAt)) continue;
      log.log(`[autopilot] ${brief.name} (${brief.taskId})`);
      let outcome: Outcome;
      try {
        outcome = await autopilotTask(brief.taskId, deps);
      } catch (e) {
        outcome = { halts: [`Abgebrochen: ${causeOf(e)}`], notes: [] };
      }
      log.log(`[autopilot] ${brief.taskId}: ${"halts" in outcome ? outcome.halts.join(" | ") : outcome.campaignId}`);
      await addComment(brief.taskId, commentFor(outcome));
    }
  } catch (e) {
    log.error(`[autopilot] ${causeOf(e)}`);
  } finally {
    running = false;
  }
}
