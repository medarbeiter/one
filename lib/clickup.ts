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

export type Brief = {
  taskId: string;
  name: string;
  /** Der Kundenordner – so heißt der Kunde in ClickUp. */
  customer: string;
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
  folder?: { name?: string };
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
    assignees: (raw.assignees ?? []).map((a) => a.email ?? "").filter(Boolean),
    description: raw.markdown_description ?? raw.description ?? "",
    dailyBudgetEuros: parseEuro(field(raw, "Tagesbudget")),
    spendCapEuros: parseEuro(field(raw, "Ausgabenlimit")),
    rolesText: text(field(raw, "gesuchte Stellen")),
    driveUrl: text(field(raw, "Drive-Link")),
    createdAt: Number(raw.date_created) || 0,
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

/** Alle Aufgaben im Status „kampagne anlegen“, workspace-weit, seitenweise bis leer. */
export async function listOpenBriefs(): Promise<Brief[]> {
  const id = await team();
  const out: Brief[] = [];
  for (let page = 0; ; page++) {
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
