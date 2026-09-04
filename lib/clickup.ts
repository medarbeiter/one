/**
 * ClickUp, der Auftragseingang: je Kunde ein Ordner, darin eine Liste
 * „Meta-Kampagnen“, darin die Infotask der Kampagne. Welche davon dran ist,
 * sagt ihr Status – `kampagne anlegen`. Der Assistent liest sie, legt die
 * Kampagne an und schiebt die Aufgabe auf `abnahme kampagne`.
 *
 * Kein SDK: drei Aufrufe gegen die REST-API v2 mit einem persönlichen Token.
 * Die Team-ID (ein Workspace) wird beim ersten Aufruf gelesen und behalten.
 */
import { ROLES } from "./naming";

const API = "https://api.clickup.com/api/v2";
export const OPEN_STATUS = "kampagne anlegen";
export const DONE_STATUS = "abnahme kampagne";

const BARE_ID = /^[a-z0-9]{6,12}$/;

/**
 * Eine ClickUp-Aufgabe aus freiem Text: die nackte ID („86cbd7afg“) oder ein
 * Task-Link („…/t/86cbd7afg“, auch „…/t/<teamId>/<id>“ – dann zählt das
 * letzte Segment). Alles andere, etwa ein Kundenname, ist keine ID.
 */
export function taskIdFromInput(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (BARE_ID.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.indexOf("t") === -1) return undefined;
  const id = parts.at(-1);
  return id && BARE_ID.test(id) ? id : undefined;
}

export type Brief = {
  taskId: string;
  name: string;
  /** Der Kundenordner – so heißt der Kunde in ClickUp. */
  customer: string;
  /** ID des Kundenordners – für den Fallback auf die Kundenübersicht. */
  folderId?: string;
  /** E-Mails der Verantwortlichen – für „meine zuerst“. */
  assignees: string[];
  /** Die Beschreibung, roh (Markdown). Steht wörtlich im Vorschlag. */
  description: string;
  dailyBudgetEuros?: number;
  spendCapEuros?: number;
  /** Custom Field „gesuchte Stellen“, ungeparst – Kürzel oder eine Notiz wie „s. OB“. */
  rolesText?: string;
  /** Custom Field „Drive-Link“ – meist leer, dann sucht lib/drive.ts den Ordner. */
  driveUrl?: string;
  createdAt: number;
};

type RawField = { name: string; type: string; value?: unknown };

/** Der Teil der ClickUp-Antwort, den toBrief liest. */
export type RawTask = {
  id: string;
  name: string;
  status: { status: string };
  date_created: string;
  description?: string | null;
  markdown_description?: string | null;
  folder?: { id?: string; name?: string };
  assignees?: { username?: string; email?: string }[];
  custom_fields?: RawField[];
};

/**
 * Beträge stehen mal als Zahl (currency-Feld), mal als Text („2435€“,
 * „2.435 €“, „2435,50€“). Komma ist Dezimaltrenner, ein Punkt vor genau drei
 * Ziffern ein Tausenderpunkt; alles andere ist die Zahl selbst. Null und
 * Unlesbares sind „nicht angegeben“ – ein Limit von 0 € gibt es nicht.
 */
export function parseEuro(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v !== "string") return undefined;
  let s = v.replace(/[^\d.,]/g, "");
  if (!s) return undefined;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// „Stv. PDL“ ist das einzige Kürzel mit Leerzeichen – vor dem Zerlegen zu
// einem Token gemacht, damit es nicht als „stv“ und „pdl“ ankommt.
const BY_TOKEN = new Map(ROLES.map((r) => [r.code.toLowerCase().replace(/[^a-z]/g, ""), r.code]));

/**
 * Kürzel aus einem Text: „PFK/PDL“, „fk, hk und stv. pdl“. Was kein Kürzel
 * ist, wird Freitext – aber nur, wenn daneben ein Kürzel steht. Ein Text ganz
 * ohne Kürzel („s. OB“ = siehe Onboarding) ist eine Notiz und keine Rolle;
 * als Freitext stünde er sonst im Kampagnennamen.
 */
export function parseRoles(text: string): { roles: string[]; free: string } {
  const tokens = text
    .replace(/stv\.?\s*pdl/gi, "stvpdl")
    .split(/[\/,+&]|\s+und\s+|\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const roles: string[] = [];
  const free: string[] = [];
  for (const t of tokens) {
    const code = BY_TOKEN.get(t.toLowerCase().replace(/[^a-z]/g, ""));
    if (code) {
      if (!roles.includes(code)) roles.push(code);
    } else free.push(t);
  }
  return roles.length ? { roles, free: free.join(" ") } : { roles: [], free: "" };
}

/**
 * Stellen, wie Mistral sie aus der Beschreibung oder der Onboarding-Tabelle
 * liest („PA“, „Pflegefachkraft“, „Praxisanleiter“): was ein Kürzel oder ein
 * Label aus ROLES ist, wird Kürzel; alles andere bleibt als Freitext stehen –
 * der Assistent darf Stellen erfinden, die die Liste nicht kennt, aber die
 * Liste ist der bessere Weg, wo sie passt.
 */
const BY_LABEL = new Map(ROLES.map((r) => [r.label.toLowerCase(), r.code]));
export function rolesFromTitles(titles: string[]): { roles: string[]; free: string } {
  const roles: string[] = [];
  const free: string[] = [];
  for (const raw of titles.map((t) => t.trim()).filter(Boolean)) {
    // „sPDL“ und „stellv. PDL“ sind dasselbe Kürzel wie „Stv. PDL“.
    const title = raw.replace(/^s(?:tellv|tv)?\.?\s*pdl$/i, "Stv. PDL");
    // Plural zurück auf das Label: „Pflegefachkräfte“ → „pflegefachkraft“,
    // „Betreuungskräfte“ → „betreuungskraft“, „Pflegehelfer“ bleibt.
    const singular = title.toLowerCase().replace(/kräfte$/, "kraft").replace(/(?<!kraf)te?n?$/, "");
    const code =
      BY_TOKEN.get(title.toLowerCase().replace(/[^a-z]/g, "")) ??
      BY_LABEL.get(title.toLowerCase()) ??
      BY_LABEL.get(singular) ??
      BY_LABEL.get(title.toLowerCase().replace(/e?n$/, ""));
    // „Pflegekräfte (PFK)“: das Kürzel steckt im Titel – dann zählt es allein.
    const inside = code ? [code] : parseRoles(title).roles;
    if (inside.length) {
      for (const c of inside) if (!roles.includes(c)) roles.push(c);
    } else if (!free.some((f) => f.toLowerCase() === title.toLowerCase())) free.push(title);
  }
  return { roles, free: free.join(" / ") };
}

/**
 * Aufgabennamen nach der Konvention aus lib/naming.ts: „Kunde - Rollen ab
 * Datum Kürzel“. Zwischen „ - “ und „ ab “ stehen die Rollen, oft mit dem Ort
 * („PFK Renningen“) – der Ort ist kein Freitext, deshalb nur die Kürzel.
 */
export function rolesFromTaskName(name: string): string[] {
  const m = name.match(/ - (.+?) ab /);
  return m ? parseRoles(m[1]).roles : [];
}

const field = (raw: RawTask, name: string) =>
  raw.custom_fields?.find((f) => f.name.trim() === name)?.value;

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function toBrief(raw: RawTask): Brief {
  return {
    taskId: raw.id,
    name: raw.name,
    customer: raw.folder?.name?.trim() ?? "",
    folderId: text(raw.folder?.id),
    assignees: (raw.assignees ?? []).map((a) => a.email ?? "").filter(Boolean),
    description: raw.markdown_description ?? raw.description ?? "",
    dailyBudgetEuros: parseEuro(field(raw, "Tagesbudget")),
    spendCapEuros: parseEuro(field(raw, "Ausgabenlimit")),
    rolesText: text(field(raw, "gesuchte Stellen")),
    driveUrl: text(field(raw, "Drive-Link")),
    createdAt: Number(raw.date_created) || 0,
  };
}

/**
 * Adresse und offene Stellen aus der Kundenübersicht – zwei Zeilen per
 * Regex, nie per Modell: die Seite trägt Passwörter und Kontaktdaten, die
 * niemals als Prompt an Mistral gehen oder irgendwo geloggt werden dürfen.
 * Nur diese zwei Werte verlassen die Funktion, der Rest der Seite bleibt
 * ungelesen im Aufrufer.
 */
export function overviewFacts(markdown: string): { address?: string; rolesText?: string; radiusKm?: number } {
  // [ \t] statt \s: \s schließt \n ein und würde sonst über die Zeile hinaus
  // bis in den nächsten Wert hinein fressen, wenn der Wert leer ist.
  const pick = (label: string) => {
    const m = markdown.match(new RegExp(`^${label}:[ \\t]*(.+?)[ \\t]*$`, "m"));
    const v = m?.[1]?.replace(/^\*+|\*+$/g, "").trim();
    return v || undefined;
  };
  // „Umkreis: 30 km“ – eine Zahl, sonst nichts; der Rest der Zeile ist Prosa.
  const km = Number(pick("(?:Umkreis|Radius)")?.match(/\d+/)?.[0]);
  return {
    address: pick("Adresse"),
    rolesText: pick("Offene Stellen"),
    ...(km > 0 && { radiusKm: km }),
  };
}

function token(): string {
  const t = process.env.CLICKUP_API_TOKEN;
  if (!t) throw new Error("CLICKUP_API_TOKEN fehlt in der Umgebung (.env.local).");
  return t;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: { authorization: token(), "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

let teamId: string | undefined;
async function team(): Promise<string> {
  if (teamId) return teamId;
  const { teams } = await api<{ teams: { id: string }[] }>("team");
  if (!teams?.length) throw new Error("ClickUp: das Token gehört zu keinem Workspace.");
  return (teamId = teams[0].id);
}

// Docs (die Kundenübersicht ist eins) leben nur in der v3-API – `api()`
// bleibt für v2 stehen, das ist der einzige v3-Aufruf im Modul.
async function apiV3<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.clickup.com/api/v3/${path}`, {
    headers: { authorization: token() },
  });
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

type FolderView = { id: string; name: string; type: string };
type DocPage = { id: string; name: string; content?: string; pages?: DocPage[] };

/**
 * Fallback-Quelle für Standort und offene Stellen: das Doc „Kundenübersicht“
 * im Kundenordner, wenn die Aufgabe selbst schweigt. Liefert `{}`, wenn es
 * kein solches Doc gibt – der Aufrufer macht daraus keine Warnung, nur einen
 * Fehler beim Netzzugriff propagiert.
 */
export async function customerOverview(folderId: string): Promise<ReturnType<typeof overviewFacts>> {
  const { views } = await api<{ views: FolderView[] }>(`folder/${folderId}/view`);
  const view = views.find((v) => v.type === "doc" && /kunden.?übersicht/i.test(v.name));
  if (!view) return {};
  const id = await team();
  const pages = await apiV3<DocPage[]>(
    `workspaces/${id}/docs/${view.id}/pages?max_page_depth=1&content_format=text/md`,
  );
  const page = pages.find((p) => /kunden.?übersicht/i.test(p.name)) ?? pages[0];
  return overviewFacts(page?.content ?? "");
}

/** Alle Aufgaben im Status „kampagne anlegen“, workspace-weit, seitenweise bis leer. */
export async function listOpenBriefs(): Promise<Brief[]> {
  const id = await team();
  const out: Brief[] = [];
  // Deckel gegen eine Endlosschleife hinter einer Server-Action, falls
  // ClickUp `page` je ignorieren sollte; 20 Seiten à 100 Aufgaben liegen
  // weit über der echten Liste.
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ page: String(page), subtasks: "false", include_closed: "false" });
    q.append("statuses[]", OPEN_STATUS);
    const { tasks } = await api<{ tasks: RawTask[] }>(`team/${id}/task?${q}`);
    if (!tasks?.length) break;
    out.push(...tasks.map(toBrief));
  }
  return out;
}

/** Eine Aufgabe mit Beschreibung als Markdown – die Liste liefert nur Klartext. */
export const getBrief = async (taskId: string): Promise<Brief> =>
  toBrief(await api<RawTask>(`task/${encodeURIComponent(taskId)}?include_markdown_description=true`));

/** Nach dem Anlegen: Status weiter, Kommentar mit dem Ergebnis dran. */
export async function closeBrief(taskId: string, comment: string): Promise<void> {
  const path = `task/${encodeURIComponent(taskId)}`;
  await api(path, { method: "PUT", body: JSON.stringify({ status: DONE_STATUS }) });
  await api(`${path}/comment`, { method: "POST", body: JSON.stringify({ comment_text: comment }) });
}
