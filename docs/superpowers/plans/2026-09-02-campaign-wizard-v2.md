# Kampagnen-Assistent v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-step form under `/campaigns/new` with Auftrag → Vorschlag → Anlegen: pick a ClickUp task, the app assembles the campaign from ClickUp, the Onboarding-Tabelle in Drive, the last campaign and the login; the person corrects and creates.

**Architecture:** Two new pure-ish server modules (`lib/clickup.ts`, `lib/brief.ts`) gather the brief; `state.ts` gains `applyBrief` that fills only untouched fields and records the source of each; `wizard.tsx` is rewritten around three screens and delegates screen 1 to `auftrag.tsx`, screen 2's head to `vorschlag.tsx`. `AdSetBlock` loses its dialogs, generates on mount, watches the page's lead forms, and hosts the Drive shelf. Everything under it (upload queue, content grid, crop, preview, launch) is unchanged.

**Tech Stack:** Next 16 (App Router, Server Actions, Route Handlers), React 19, `@astryxdesign/core` components, Bun test (`bun test <file>`), Mistral via `mistral()` in `lib/bodies.ts`, ClickUp REST v2, Google Drive REST v3 with the existing service account.

**Spec:** `docs/superpowers/specs/2026-09-02-campaign-wizard-v2-design.md`

## Global Constraints

- No prettier/eslint in this repo. Never run a formatter; match the surrounding style by hand (2-space indent, double quotes, trailing commas, ~100 columns).
- Comments and UI copy in German, in the voice of the existing files (a comment says *why*, not *what*). Test names in German or English, both exist.
- Read `node_modules/next/dist/docs/` before touching `page.tsx`, actions or route handlers; this Next differs from training data.
- Mistral calls only on the server, through `mistral()` from `lib/bodies.ts`. Pure parsers for every model answer, tested like `parseTitles`.
- Nothing in the brief may block: a failed source leaves its field empty and adds a line to `warnings`.
- Mandatory and always visible on the Vorschlag: Kunde, Standort, Lead-Formular, Tagesbudget. Collapsed under "Optional": Werbekonto, Startdatum, Ausgabenlimit, Kampagnenname, Kürzel.
- ClickUp status after creation: exactly `abnahme kampagne`. Open briefs: status `kampagne anlegen`.
- Benefits from the Onboarding-Tabelle come only from "Besteht aktuell" under "Wie gestaltet sich Ihr Jobangebot?", never from "Weitere Vorschläge".
- Drafts move to key `medarbeiter:new-campaign:drafts:v2`; v1 drafts are ignored, not migrated.
- Commit after every task with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer. Do not commit `AGENTS.md` changes that `next dev` re-adds.
- Deviation from the spec, decided here: `assembleBrief` does not call `lastCampaignDefaults`. The existing client-side prefill effect in the wizard stays and stamps `sources.location = "previous"` when it applies. One fewer server dependency, same result.

---

### Task 1: Kürzel aus dem Namen (`initialsOf`)

**Files:**
- Modify: `lib/naming.ts` (append after `KNOWN_INITIALS`)
- Test: `lib/naming.test.ts` (append)

**Interfaces:**
- Produces: `initialsOf(name: string): string`

- [ ] **Step 1: Write the failing tests**

Append to `lib/naming.test.ts`:

```ts
import { initialsOf } from "./naming";

test("initialsOf nimmt Vor- und Nachnamen", () => {
  expect(initialsOf("Karl Fischer")).toBe("KF");
  expect(initialsOf("Maria Anna Huber")).toBe("MH");
});

test("initialsOf bei einem Wort: die ersten zwei Buchstaben", () => {
  expect(initialsOf("Felix")).toBe("FE");
});

test("initialsOf bei nichts: nichts", () => {
  expect(initialsOf("")).toBe("");
  expect(initialsOf("   ")).toBe("");
});
```

(Fold the `initialsOf` import into the existing import line from `./naming`.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/naming.test.ts`
Expected: FAIL, `initialsOf` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/naming.ts`:

```ts
/**
 * Das Kürzel im Kampagnennamen kommt aus dem Namen der angemeldeten Person –
 * vorher aus KNOWN_INITIALS und dem localStorage, also aus einer Liste, die bei
 * jeder neuen Kollegin nachzupflegen war. Erster und letzter Namensteil, denn
 * „Maria Anna Huber“ zeichnet als MH; ein einzelnes Wort gibt seine ersten
 * zwei Buchstaben. Wer anders zeichnet, ändert es im Assistenten unter Optional.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/naming.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/naming.ts lib/naming.test.ts
git commit -m "feat: Kürzel aus dem Namen der angemeldeten Person

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: ClickUp-Anbindung (`lib/clickup.ts`)

**Files:**
- Create: `lib/clickup.ts`
- Create: `lib/clickup.test.ts`
- Modify: `.env.example` (append one block)

**Interfaces:**
- Consumes: `ROLES` from `lib/naming.ts`
- Produces:
  - `type Brief = { taskId; name; customer; assignees: string[]; description; dailyBudgetEuros?; spendCapEuros?; rolesText?; driveUrl?; createdAt: number }`
  - `type RawTask` (ClickUp JSON shape, subset)
  - `parseEuro(v: unknown): number | undefined`
  - `parseRoles(text: string): { roles: string[]; free: string }`
  - `rolesFromTaskName(name: string): string[]`
  - `toBrief(raw: RawTask): Brief`
  - `listOpenBriefs(): Promise<Brief[]>`, `getBrief(taskId): Promise<Brief>`, `closeBrief(taskId, comment): Promise<void>`
  - `OPEN_STATUS = "kampagne anlegen"`, `DONE_STATUS = "abnahme kampagne"`

- [ ] **Step 1: Write the failing tests**

Create `lib/clickup.test.ts`:

```ts
import { expect, test } from "bun:test";
import { parseEuro, parseRoles, rolesFromTaskName, toBrief, type RawTask } from "./clickup";

test("parseEuro liest Zahlen, Texte mit Euro-Zeichen und deutsche Schreibweisen", () => {
  expect(parseEuro(17.05)).toBe(17.05);
  expect(parseEuro("17.05")).toBe(17.05);
  expect(parseEuro("2435€")).toBe(2435);
  expect(parseEuro("2.435 €")).toBe(2435);
  expect(parseEuro("2435,50€")).toBe(2435.5);
});

test("parseEuro gibt bei Müll und Null nichts zurück", () => {
  expect(parseEuro(null)).toBeUndefined();
  expect(parseEuro("")).toBeUndefined();
  expect(parseEuro("nein")).toBeUndefined();
  expect(parseEuro("0")).toBeUndefined();
});

test("parseRoles erkennt Kürzel, auch gemischt geschrieben und mit Trennzeichen", () => {
  expect(parseRoles("FK")).toEqual({ roles: ["FK"], free: "" });
  expect(parseRoles("PFK/PDL")).toEqual({ roles: ["PFK", "PDL"], free: "" });
  expect(parseRoles("fk, hk und stv. pdl")).toEqual({ roles: ["FK", "HK", "Stv. PDL"], free: "" });
});

test("parseRoles: kein Kürzel heißt keine Rolle – „s. OB“ ist eine Notiz, kein Freitext", () => {
  expect(parseRoles("s. OB")).toEqual({ roles: [], free: "" });
});

test("parseRoles: Unbekanntes neben einem Kürzel wird Freitext", () => {
  expect(parseRoles("FK Verwaltungskraft")).toEqual({ roles: ["FK"], free: "Verwaltungskraft" });
});

test("rolesFromTaskName liest die Rollen zwischen „ - “ und „ ab “ – und lässt den Ort weg", () => {
  expect(rolesFromTaskName("MeVita Pflegedienst GmbH - PFK Renningen ab x.9.26 KF (via One)")).toEqual(["PFK"]);
  expect(rolesFromTaskName("Aktiv Dahoam sPDL Kampagne ab 29.07 MH")).toEqual([]);
  expect(rolesFromTaskName("X - FK/HK ab 03.01.26 KF (via One)")).toEqual(["FK", "HK"]);
});

// Gekürzt aus der echten Aufgabe 86cbd7afg (Probe vom 2026-09-02).
const mevita: RawTask = {
  id: "86cbd7afg",
  name: "MeVita Pflegedienst GmbH - PFK Renningen ab x.9.26 KF (via One)",
  status: { status: "kampagne anlegen" },
  date_created: "1756800000000",
  markdown_description: "neu anlegen, infos fast identisch zu letzter\nFK für Renningen",
  folder: { name: " MeVita Pflegedienst GmbH" },
  assignees: [{ username: "Felix Kinze", email: "f.kinze@med-arbeiter.de" }],
  custom_fields: [
    { name: "Tagesbudget", type: "currency", value: "17.05" },
    { name: "Ausgabenlimit", type: "short_text", value: null },
    { name: "Drive-Link", type: "url", value: null },
    { name: "gesuchte Stellen", type: "short_text", value: "FK" },
    { name: "Kanal ", type: "drop_down", value: null },
  ],
};

test("toBrief bildet die Aufgabe ab: Ordnername getrimmt, Felder geparst, Leeres weggelassen", () => {
  expect(toBrief(mevita)).toEqual({
    taskId: "86cbd7afg",
    name: "MeVita Pflegedienst GmbH - PFK Renningen ab x.9.26 KF (via One)",
    customer: "MeVita Pflegedienst GmbH",
    assignees: ["f.kinze@med-arbeiter.de"],
    description: "neu anlegen, infos fast identisch zu letzter\nFK für Renningen",
    dailyBudgetEuros: 17.05,
    spendCapEuros: undefined,
    rolesText: "FK",
    driveUrl: undefined,
    createdAt: 1756800000000,
  });
});

test("toBrief liest das Ausgabenlimit als Text mit Euro-Zeichen", () => {
  const raw: RawTask = {
    ...mevita,
    custom_fields: [{ name: "Ausgabenlimit", type: "short_text", value: "2435€" }],
  };
  expect(toBrief(raw).spendCapEuros).toBe(2435);
  expect(toBrief(raw).dailyBudgetEuros).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/clickup.test.ts`
Expected: FAIL, module `./clickup` not found.

- [ ] **Step 3: Implement**

Create `lib/clickup.ts`:

```ts
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
```

Append to `.env.example`:

```
# ClickUp – der Auftragseingang des Kampagnen-Assistenten (lib/clickup.ts).
# Persönliches API-Token (Einstellungen → Apps); braucht Lese- und Schreibrecht
# auf die Kundenlisten „Meta-Kampagnen“.
CLICKUP_API_TOKEN=
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/clickup.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Smoke-test the live API once**

Run: `bun --env-file=.env.local -e 'import { listOpenBriefs } from "./lib/clickup"; console.log((await listOpenBriefs()).map(b => [b.customer, b.name, b.dailyBudgetEuros]))'`
Expected: an array with at least the MeVita and Adiuvo entries (or whatever is currently in `kampagne anlegen`). Do **not** call `closeBrief` here.

- [ ] **Step 6: Commit**

```bash
git add lib/clickup.ts lib/clickup.test.ts .env.example
git commit -m "feat: ClickUp lesen – offene Kampagnen-Aufgaben, Felder geparst, Status nach dem Anlegen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Drive – Ordner aus Link, Onboarding-Tabelle finden und exportieren

**Files:**
- Modify: `lib/drive.ts` (append)
- Modify: `lib/drive.test.ts` (append)
- Modify: `app/api/drive/route.ts`

**Interfaces:**
- Consumes: `children`, `isFolder`, `landing`, `api` (module-private) in `lib/drive.ts`
- Produces:
  - `folderIdFromUrl(url: string): string | undefined`
  - `findSheet(folderId: string, kids?): Promise<DriveFile | undefined>`
  - `exportCsv(fileId: string): Promise<string>`
  - `landingAt(folderId: string): Promise<Landing>`
  - Route: `GET /api/drive?land=<folderId>` → `DriveSearch` (`{ folders: [], landed }`)

- [ ] **Step 1: Write the failing tests**

Append to `lib/drive.test.ts` (check the existing import line and extend it):

```ts
import { findSheet, folderIdFromUrl, type DriveFile } from "./drive";

test("folderIdFromUrl liest die Ordner-ID aus beiden Drive-Adressformen", () => {
  expect(folderIdFromUrl("https://drive.google.com/drive/folders/1AbC_dEf-9?usp=sharing")).toBe("1AbC_dEf-9");
  expect(folderIdFromUrl("https://drive.google.com/open?id=1AbC_dEf-9")).toBe("1AbC_dEf-9");
  expect(folderIdFromUrl("https://example.com")).toBeUndefined();
});

const SHEET = "application/vnd.google-apps.spreadsheet";
const FOLDER = "application/vnd.google-apps.folder";
const f = (id: string, name: string, mimeType = FOLDER): DriveFile => ({ id, name, mimeType });

test("findSheet findet die Onboarding-Tabelle im Kundenordner, notfalls eine Ebene tiefer", async () => {
  const tree: Record<string, DriveFile[]> = {
    kunde: [f("rec", "1 - Recruiting"), f("ob", "AWO Rottweil Onboarding", SHEET)],
    rec: [],
  };
  const kids = async (id: string) => tree[id] ?? [];
  expect((await findSheet("kunde", kids))?.id).toBe("ob");

  const deeper: Record<string, DriveFile[]> = {
    kunde: [f("docs", "Dokumente")],
    docs: [f("ob2", "Onboarding-Tabelle", SHEET)],
  };
  expect((await findSheet("kunde", async (id) => deeper[id] ?? []))?.id).toBe("ob2");
});

test("findSheet gibt ohne Tabelle nichts zurück und gräbt nicht endlos", async () => {
  const loop: Record<string, DriveFile[]> = { a: [f("b", "x")], b: [f("a", "y")] };
  expect(await findSheet("a", async (id) => loop[id] ?? [])).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/drive.test.ts`
Expected: FAIL, `findSheet`/`folderIdFromUrl` not exported.

- [ ] **Step 3: Implement**

Append to `lib/drive.ts`:

```ts
/** Die Ordner-ID aus einem Drive-Link – beide Formen, die ClickUp-Felder enthalten. */
export function folderIdFromUrl(url: string): string | undefined {
  return url.match(/\/folders\/([\w-]+)/)?.[1] ?? url.match(/[?&]id=([\w-]+)/)?.[1];
}

const SHEET = "application/vnd.google-apps.spreadsheet";

/**
 * Die Onboarding-Tabelle des Kunden: eine Google-Tabelle mit „Onboarding“ im
 * Namen, im Kundenordner oder höchstens zwei Ebenen darunter. Tiefer liegt
 * nur Kampagnenmaterial, und ein Fehltreffer aus einem fremden Ordner wäre
 * schlimmer als keiner – die Benefits landen wörtlich in den Anzeigen.
 */
export async function findSheet(
  folderId: string,
  kids = children,
  depth = 0,
): Promise<DriveFile | undefined> {
  const all = await kids(folderId);
  const hit = all.find((f) => f.mimeType === SHEET && /onboarding/i.test(f.name));
  if (hit || depth >= 2) return hit;
  for (const sub of all.filter(isFolder)) {
    const found = await findSheet(sub.id, kids, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** Eine Google-Tabelle als CSV – nur das erste Blatt, das ist die Onboarding-Tabelle. */
export const exportCsv = async (fileId: string): Promise<string> =>
  (await api(`files/${encodeURIComponent(fileId)}/export`, { mimeType: "text/csv" })).text();

/** landing() ab einem bekannten Ordner – wenn ClickUp den Drive-Link liefert. */
export async function landingAt(folderId: string): Promise<Landing> {
  const meta = (await (
    await api(`files/${encodeURIComponent(folderId)}`, { fields: "id,name,mimeType" })
  ).json()) as DriveFile;
  return landing(meta);
}
```

In `app/api/drive/route.ts`, extend the import and add the `land` branch before the `folder` branch:

```ts
import { bestLanding, download, entriesOf, findFolders, landingAt, thumbnail, type DriveFile, type Landing } from "@/lib/drive";
```

```ts
  const land = url.searchParams.get("land");
```

```ts
    if (land) return Response.json({ folders: [], landed: await landingAt(land) } satisfies DriveSearch);
```

Update the header comment of the route with the new line: `?land=<Ordner-ID> → wie ?q=, aber ab einem bekannten Ordner (Drive-Link aus ClickUp)`.

- [ ] **Step 4: Run tests**

Run: `bun test lib/drive.test.ts`
Expected: PASS.

- [ ] **Step 5: Smoke-test the sheet export once**

Run: `bun --env-file=.env.local -e 'import { findFolders, bestLanding, findSheet, exportCsv } from "./lib/drive"; const { landed } = await bestLanding(await findFolders("MeVita Pflegedienst")); const s = landed && await findSheet(landed.path[0].id); console.log(s?.name); if (s) console.log((await exportCsv(s.id)).slice(0, 800))'`
Expected: the sheet name and the first lines of the CSV. If Drive answers 403 on export, the service account lacks access to the sheet: note it in the commit message and continue, `assembleBrief` treats it as a warning.

- [ ] **Step 6: Commit**

```bash
git add lib/drive.ts lib/drive.test.ts app/api/drive/route.ts
git commit -m "feat: Drive – Ordner aus ClickUp-Link, Onboarding-Tabelle finden und als CSV lesen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Der zusammengesetzte Auftrag (`lib/brief.ts`)

**Files:**
- Create: `lib/brief.ts`
- Create: `lib/brief.test.ts`

**Interfaces:**
- Consumes: `Brief`, `getBrief`, `parseRoles`, `rolesFromTaskName` (Task 2); `findFolders`, `bestLanding`, `findSheet`, `exportCsv`, `folderIdFromUrl` (Task 3); `mistral` from `lib/bodies.ts`; `ROLES` from `lib/naming.ts`
- Produces:
  - `type Source = "clickup" | "onboarding" | "previous" | "session"`
  - `type Sourced<T> = { value: T; source: Source }`
  - `type AssembledBrief = { taskId: string; clientName?: Sourced<string>; roles?: Sourced<string[]>; roleFreeText?: Sourced<string>; benefits?: Sourced<string>; location?: Sourced<{ addressString: string }>; formHint?: Sourced<string>; dailyBudgetEuros?: Sourced<number>; spendCapEuros?: Sourced<number>; driveFolderId?: Sourced<string>; notes?: string; warnings: string[] }`
  - `parseLocationHint(content: string): { address?: string; city?: string; formHint?: string }`
  - `parseOnboarding(content: string): { benefits: string[]; roles: string[] }`
  - `assembleBrief(taskId: string, deps?: BriefDeps): Promise<AssembledBrief>`
  - `type BriefDeps` (all injectable, defaults to the real modules)

- [ ] **Step 1: Write the failing tests**

Create `lib/brief.test.ts`:

```ts
import { expect, test } from "bun:test";
import { assembleBrief, parseLocationHint, parseOnboarding, type BriefDeps } from "./brief";
import type { Brief } from "./clickup";

test("parseLocationHint nimmt Adresse, Ort und Formular-Hinweis aus dem JSON", () => {
  expect(
    parseLocationHint('{"adresse":"Mühlgasse 24+26, 71272 Renningen","ort":"Renningen","formular":"Renningen"}'),
  ).toEqual({ address: "Mühlgasse 24+26, 71272 Renningen", city: "Renningen", formHint: "Renningen" });
});

test("parseLocationHint verträgt Markdown-Zaun und null-Werte", () => {
  expect(parseLocationHint('```json\n{"adresse":null,"ort":null,"formular":null}\n```')).toEqual({});
});

test("parseLocationHint wirft bei Unlesbarem", () => {
  expect(() => parseLocationHint("keine Ahnung")).toThrow();
});

test("parseOnboarding liefert Benefits als Zeilen und nur bekannte Rollen-Kürzel", () => {
  expect(
    parseOnboarding('{"benefits":["jedes 2. Wochenende bleibt frei","33 Urlaubstage"],"rollen":["FK","XYZ","pdl"]}'),
  ).toEqual({ benefits: ["jedes 2. Wochenende bleibt frei", "33 Urlaubstage"], roles: ["FK", "PDL"] });
});

test("parseOnboarding: leere oder fehlende Listen sind leer, kein Fehler", () => {
  expect(parseOnboarding("{}")).toEqual({ benefits: [], roles: [] });
});

// --- assembleBrief mit gestubbten Quellen

const brief: Brief = {
  taskId: "t1",
  name: "MeVita Pflegedienst GmbH - PFK Renningen ab x.9.26 KF (via One)",
  customer: "MeVita Pflegedienst GmbH",
  assignees: [],
  description: "Standort für Ads Gruppe: Mühlgasse 24, 71272 Renningen\nFormular: Renningen Formular auswählen",
  dailyBudgetEuros: 17.05,
  spendCapEuros: 2435,
  rolesText: "FK",
  createdAt: 1,
};

const csv = [
  "Wie gestaltet sich Ihr Jobangebot?,Wie gestalten sich die Arbeitsbedingungen?",
  "Besteht aktuell:,- Früh- und Spätdienst",
  "- 33 Urlaubstage,",
  "- Jobrad,",
  "Weitere Vorschläge:,",
  "- Dienstwagen,",
].join("\n");

const deps = (over: Partial<BriefDeps> = {}): BriefDeps => ({
  getBrief: async () => brief,
  findFolders: async () => [{ id: "k", name: "MeVita", mimeType: "folder" }],
  bestLanding: async (folders) => ({ folders, landed: { path: folders, entries: [] } }),
  folderIdFromUrl: () => undefined,
  findSheet: async () => ({ id: "s", name: "Onboarding", mimeType: "sheet" }),
  exportCsv: async () => csv,
  mistral: async (content) =>
    typeof content === "string" && content.includes("CSV")
      ? '{"benefits":["33 Urlaubstage","Jobrad"],"rollen":[]}'
      : '{"adresse":"Mühlgasse 24, 71272 Renningen","ort":"Renningen","formular":"Renningen"}',
  ...over,
});

test("assembleBrief füllt alles aus ClickUp und der Onboarding-Tabelle, mit Herkunft", async () => {
  const out = await assembleBrief("t1", deps());
  expect(out.clientName).toEqual({ value: "MeVita Pflegedienst GmbH", source: "clickup" });
  expect(out.roles).toEqual({ value: ["FK"], source: "clickup" });
  expect(out.dailyBudgetEuros).toEqual({ value: 17.05, source: "clickup" });
  expect(out.spendCapEuros).toEqual({ value: 2435, source: "clickup" });
  expect(out.location).toEqual({ value: { addressString: "Mühlgasse 24, 71272 Renningen" }, source: "clickup" });
  expect(out.formHint).toEqual({ value: "Renningen", source: "clickup" });
  expect(out.benefits).toEqual({ value: "33 Urlaubstage\nJobrad", source: "onboarding" });
  expect(out.driveFolderId).toEqual({ value: "k", source: "clickup" });
  expect(out.notes).toBe(brief.description);
  expect(out.warnings).toEqual([]);
});

test("assembleBrief: Rollen aus dem Aufgabennamen, wenn das Feld eine Notiz ist", async () => {
  const out = await assembleBrief("t1", deps({ getBrief: async () => ({ ...brief, rolesText: "s. OB" }) }));
  expect(out.roles).toEqual({ value: ["PFK"], source: "clickup" });
});

test("assembleBrief: Rollen aus der Onboarding-Tabelle, wenn ClickUp keine hat", async () => {
  const out = await assembleBrief(
    "t1",
    deps({
      getBrief: async () => ({ ...brief, rolesText: undefined, name: "MeVita Kampagne ab 1.9." }),
      mistral: async (c) =>
        typeof c === "string" && c.includes("CSV")
          ? '{"benefits":[],"rollen":["PFK"]}'
          : '{"adresse":null,"ort":null,"formular":null}',
    }),
  );
  expect(out.roles).toEqual({ value: ["PFK"], source: "onboarding" });
  expect(out.benefits).toBeUndefined();
});

test("assembleBrief: nur der Ort, wenn keine Adresse genannt ist", async () => {
  const out = await assembleBrief(
    "t1",
    deps({
      mistral: async (c) =>
        typeof c === "string" && c.includes("CSV")
          ? "{}"
          : '{"adresse":null,"ort":"Renningen","formular":null}',
    }),
  );
  expect(out.location).toEqual({ value: { addressString: "Renningen" }, source: "clickup" });
  expect(out.formHint).toBeUndefined();
});

test("assembleBrief: jede Quelle darf ausfallen – Feld leer, Warnung dran, kein Fehler", async () => {
  const out = await assembleBrief(
    "t1",
    deps({
      findFolders: async () => [],
      mistral: async () => {
        throw new Error("429");
      },
    }),
  );
  expect(out.benefits).toBeUndefined();
  expect(out.location).toBeUndefined();
  expect(out.warnings).toHaveLength(2);
  expect(out.warnings.join(" ")).toMatch(/Drive-Ordner/);
  expect(out.warnings.join(" ")).toMatch(/Standort/);
});

test("assembleBrief: ein Drive-Link aus ClickUp schlägt die Ordnersuche", async () => {
  const folders: string[] = [];
  const out = await assembleBrief(
    "t1",
    deps({
      getBrief: async () => ({ ...brief, driveUrl: "https://drive.google.com/drive/folders/LINKED" }),
      folderIdFromUrl: () => "LINKED",
      findFolders: async (n) => {
        folders.push(n);
        return [];
      },
    }),
  );
  expect(out.driveFolderId).toEqual({ value: "LINKED", source: "clickup" });
  expect(folders).toEqual([]);
});

test("assembleBrief: ohne Tabelle im Ordner eine Warnung, der Ordner bleibt", async () => {
  const out = await assembleBrief("t1", deps({ findSheet: async () => undefined }));
  expect(out.driveFolderId?.value).toBe("k");
  expect(out.warnings.join(" ")).toMatch(/Onboarding-Tabelle/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/brief.test.ts`
Expected: FAIL, module `./brief` not found.

- [ ] **Step 3: Implement**

Create `lib/brief.ts`:

```ts
/**
 * Der Auftrag, zusammengesetzt: was der Assistent über eine Kampagne wissen
 * kann, bevor jemand tippt. Drei Quellen, alle parallel, keine darf blocken –
 * ein Ausfall lässt das Feld leer und hinterlässt eine Warnung, die der
 * Vorschlag zeigt.
 *
 *   ClickUp-Aufgabe        Kunde, Budget, Limit, Rollen, Drive-Link, Beschreibung
 *   Mistral über die       Standort (Adresse oder Ort), Hinweis aufs Formular
 *   Beschreibung
 *   Onboarding-Tabelle     Benefits („Besteht aktuell“), Rollen
 *   (Drive, über Mistral)
 *
 * Jeder Wert trägt seine Herkunft: das Etikett steht im Vorschlag am Feld,
 * damit ein falsch gelesener Wert auffällt statt unbemerkt in die Anzeige zu
 * wandern. Alles Netz ist injizierbar (BriefDeps) – der Zusammenbau ist
 * damit ohne ClickUp, Drive und Mistral prüfbar.
 */
import { mistral as realMistral } from "./bodies";
import { getBrief as realGetBrief, parseRoles, rolesFromTaskName, type Brief } from "./clickup";
import {
  bestLanding as realBestLanding,
  exportCsv as realExportCsv,
  findFolders as realFindFolders,
  findSheet as realFindSheet,
  folderIdFromUrl as realFolderIdFromUrl,
  type DriveFile,
} from "./drive";
import { ROLES } from "./naming";

export type Source = "clickup" | "onboarding" | "previous" | "session";
export type Sourced<T> = { value: T; source: Source };

export type AssembledBrief = {
  taskId: string;
  clientName?: Sourced<string>;
  roles?: Sourced<string[]>;
  roleFreeText?: Sourced<string>;
  benefits?: Sourced<string>;
  location?: Sourced<{ addressString: string }>;
  /** Ein Name oder Ort, nach dem das Lead-Formular zu wählen ist („Renningen“). */
  formHint?: Sourced<string>;
  dailyBudgetEuros?: Sourced<number>;
  spendCapEuros?: Sourced<number>;
  driveFolderId?: Sourced<string>;
  /** Die Beschreibung der Aufgabe, wörtlich – Anweisungen für Menschen. */
  notes?: string;
  warnings: string[];
};

export type BriefDeps = {
  getBrief: (taskId: string) => Promise<Brief>;
  findFolders: (name: string) => Promise<DriveFile[]>;
  bestLanding: (folders: DriveFile[]) => Promise<{ landed: { path: DriveFile[] } | null }>;
  folderIdFromUrl: (url: string) => string | undefined;
  findSheet: (folderId: string) => Promise<DriveFile | undefined>;
  exportCsv: (fileId: string) => Promise<string>;
  mistral: (content: string, opts?: { temperature?: number }) => Promise<string>;
};

const realDeps: BriefDeps = {
  getBrief: realGetBrief,
  findFolders: realFindFolders,
  bestLanding: realBestLanding,
  folderIdFromUrl: realFolderIdFromUrl,
  findSheet: realFindSheet,
  exportCsv: realExportCsv,
  mistral: realMistral,
};

const unfence = (s: string) => s.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Antwort auf locationPrompt(). Wirft bei Unlesbarem – der Aufrufer macht eine Warnung daraus. */
export function parseLocationHint(content: string): { address?: string; city?: string; formHint?: string } {
  let data: { adresse?: unknown; ort?: unknown; formular?: unknown };
  try {
    data = JSON.parse(unfence(content));
  } catch {
    throw new Error("Mistral hat kein lesbares JSON geliefert.");
  }
  const out: { address?: string; city?: string; formHint?: string } = {};
  const address = str(data.adresse);
  const city = str(data.ort);
  const formHint = str(data.formular);
  if (address) out.address = address;
  if (city) out.city = city;
  if (formHint) out.formHint = formHint;
  return out;
}

const CODES = new Map(ROLES.map((r) => [r.code.toLowerCase(), r.code]));

/** Antwort auf onboardingPrompt(). Rollen nur, wenn sie ein Kürzel aus ROLES sind. */
export function parseOnboarding(content: string): { benefits: string[]; roles: string[] } {
  let data: { benefits?: unknown; rollen?: unknown };
  try {
    data = JSON.parse(unfence(content));
  } catch {
    throw new Error("Mistral hat kein lesbares JSON geliefert.");
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => Boolean(s)) : []);
  const roles: string[] = [];
  for (const r of list(data.rollen)) {
    const code = CODES.get(r.toLowerCase());
    if (code && !roles.includes(code)) roles.push(code);
  }
  return { benefits: list(data.benefits).map((b) => b.replace(/^[-–•*]\s*/, "")), roles };
}

function locationPrompt(description: string): string {
  return `Das ist die Beschreibung einer Aufgabe zum Anlegen einer Meta-Stellenanzeigen-Kampagne für einen Pflege-Arbeitgeber.

Lies heraus:
1. Den Standort der Anzeigengruppe: eine vollständige Adresse (Straße, PLZ, Ort), falls eine genannt ist – sonst nur den Ortsnamen. Steht kein Standort in der Beschreibung, beides null.
2. Einen Hinweis, welches Lead-Formular zu wählen ist – ein Name oder Ort, wie er in der Beschreibung steht (z. B. „Renningen“). Nennt die Beschreibung keins, null.

Erfinde nichts. Antworte ausschließlich mit JSON: {"adresse": "…" oder null, "ort": "…" oder null, "formular": "…" oder null}

BESCHREIBUNG:
${description}`;
}

function onboardingPrompt(csv: string): string {
  const codes = ROLES.map((r) => `${r.code} = ${r.label}`).join(", ");
  return `Das ist der CSV-Export der Onboarding-Tabelle eines Pflege-Arbeitgebers.

Lies heraus:
1. Benefits: AUSSCHLIESSLICH aus dem Block „Wie gestaltet sich Ihr Jobangebot?“, und dort nur die Zeilen unter „Besteht aktuell“. Zeilen unter „Weitere Vorschläge“ oder einer ähnlichen Überschrift NIEMALS übernehmen – auch nicht, wenn sie stärker klingen. Jede Zeile wörtlich, ohne führendes „- “.
2. Rollen: aus „Welche fachlichen Voraussetzungen muss der Kandidat erfüllen?“, als Kürzel aus dieser Liste: ${codes}. Nur Kürzel, die klar passen (exam. FK → FK, Pflegefachkraft → PFK); im Zweifel weglassen.

Antworte ausschließlich mit JSON: {"benefits": ["…"], "rollen": ["FK"]}

CSV:
${csv}`;
}

async function readOnboarding(
  brief: Brief,
  deps: BriefDeps,
  warnings: string[],
): Promise<{ folderId?: string; benefits: string[]; roles: string[] }> {
  let folderId = brief.driveUrl ? deps.folderIdFromUrl(brief.driveUrl) : undefined;
  if (!folderId) {
    try {
      const { landed } = await deps.bestLanding(await deps.findFolders(brief.customer));
      folderId = landed?.path[0]?.id;
    } catch (e) {
      warnings.push(`Drive nicht erreichbar: ${(e as Error).message}`);
      return { benefits: [], roles: [] };
    }
  }
  if (!folderId) {
    warnings.push(`Kein Drive-Ordner für „${brief.customer}“ gefunden – Benefits bitte eintragen.`);
    return { benefits: [], roles: [] };
  }
  try {
    const sheet = await deps.findSheet(folderId);
    if (!sheet) {
      warnings.push("Keine Onboarding-Tabelle im Drive-Ordner gefunden – Benefits bitte eintragen.");
      return { folderId, benefits: [], roles: [] };
    }
    const parsed = parseOnboarding(await deps.mistral(onboardingPrompt(await deps.exportCsv(sheet.id)), { temperature: 0 }));
    return { folderId, ...parsed };
  } catch (e) {
    warnings.push(`Onboarding-Tabelle nicht gelesen: ${(e as Error).message}`);
    return { folderId, benefits: [], roles: [] };
  }
}

export async function assembleBrief(taskId: string, deps: BriefDeps = realDeps): Promise<AssembledBrief> {
  const warnings: string[] = [];
  const brief = await deps.getBrief(taskId);
  const out: AssembledBrief = { taskId, warnings };
  if (brief.customer) out.clientName = { value: brief.customer, source: "clickup" };
  if (brief.description.trim()) out.notes = brief.description.trim();
  if (brief.dailyBudgetEuros) out.dailyBudgetEuros = { value: brief.dailyBudgetEuros, source: "clickup" };
  if (brief.spendCapEuros) out.spendCapEuros = { value: brief.spendCapEuros, source: "clickup" };

  // Das Feld vor dem Namen: es ist die ausdrückliche Angabe. Der Name trägt
  // die Rollen nur, wenn er nach der Konvention gebaut ist.
  const fromField = brief.rolesText ? parseRoles(brief.rolesText) : { roles: [], free: "" };
  const roles = fromField.roles.length ? fromField.roles : rolesFromTaskName(brief.name);
  if (roles.length) out.roles = { value: roles, source: "clickup" };
  if (fromField.roles.length && fromField.free) out.roleFreeText = { value: fromField.free, source: "clickup" };

  const [hint, sheet] = await Promise.all([
    brief.description.trim()
      ? deps
          .mistral(locationPrompt(brief.description), { temperature: 0 })
          .then(parseLocationHint)
          .catch((e: Error) => {
            warnings.push(`Standort aus der Aufgabe nicht gelesen: ${e.message}`);
            return {} as ReturnType<typeof parseLocationHint>;
          })
      : Promise.resolve({} as ReturnType<typeof parseLocationHint>),
    readOnboarding(brief, deps, warnings),
  ]);

  const addressString = hint.address ?? hint.city;
  if (addressString) out.location = { value: { addressString }, source: "clickup" };
  if (hint.formHint) out.formHint = { value: hint.formHint, source: "clickup" };

  if (sheet.folderId) out.driveFolderId = { value: sheet.folderId, source: "clickup" };
  if (sheet.benefits.length) out.benefits = { value: sheet.benefits.join("\n"), source: "onboarding" };
  if (!out.roles && sheet.roles.length) out.roles = { value: sheet.roles, source: "onboarding" };

  return out;
}
```

Note on `driveFolderId` source: it is `"clickup"` whether the link came from the field or the folder was found by the customer's name; the label reads "aus ClickUp" for the customer either way. Keep it simple.

- [ ] **Step 4: Run tests**

Run: `bun test lib/brief.test.ts`
Expected: PASS (12 tests). If the "jede Quelle darf ausfallen" test counts 3 warnings, check that `readOnboarding` returns after the first warning, as written.

- [ ] **Step 5: Commit**

```bash
git add lib/brief.ts lib/brief.test.ts
git commit -m "feat: Auftrag zusammensetzen – ClickUp, Beschreibung und Onboarding-Tabelle mit Herkunft je Feld

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Server Actions und die Session auf der Seite

**Files:**
- Modify: `app/campaigns/actions.ts` (append)
- Modify: `app/campaigns/new/page.tsx`

**Interfaces:**
- Consumes: `listOpenBriefs`, `closeBrief`, `Brief` (Task 2); `assembleBrief`, `AssembledBrief` (Task 4); `initialsOf` (Task 1); `openSession`, `SESSION_COOKIE`, `sessionSecret` from `lib/session.ts`
- Produces:
  - `briefsAction(): Promise<{ briefs: Brief[]; error?: string }>`
  - `briefAction(taskId: string): Promise<{ brief?: AssembledBrief; error?: string }>`
  - `closeBriefAction(taskId: string, campaignName: string, adAccount: string, campaignId: string): Promise<{ error?: string }>`
  - `Wizard` props change: `knownInitials` removed; `initials: string`, `email: string` added (consumed in Task 10)

- [ ] **Step 1: Append the actions**

Append to `app/campaigns/actions.ts` (add the imports at the top of the file):

```ts
import { closeBrief, listOpenBriefs, type Brief } from "@/lib/clickup";
import { assembleBrief, type AssembledBrief } from "@/lib/brief";
```

```ts
// Derselbe Umweg wie bei den Mistral-Aktionen: das ClickUp-Token liegt in
// process.env, und der Fehlertext (Token abgelaufen, kein Zugriff auf die
// Liste) muss beim Bediener ankommen statt als generische Produktionsmeldung.
export async function briefsAction(): Promise<{ briefs: Brief[]; error?: string }> {
  try {
    return { briefs: await listOpenBriefs() };
  } catch (e) {
    return { briefs: [], error: (e as Error).message };
  }
}

/** Der Auftrag samt allem, was sich dazu lesen lässt – siehe lib/brief.ts. */
export async function briefAction(taskId: string): Promise<{ brief?: AssembledBrief; error?: string }> {
  try {
    return { brief: await assembleBrief(taskId) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Ads Manager erwartet die Konto-ID ohne "act_" – dieselbe Adresse wie in receipt.tsx.
const adsManagerUrl = (adAccount: string, campaignId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccount.replace(/^act_/, "")}&selected_campaign_ids=${campaignId}`;

/**
 * Nach dem Anlegen: Aufgabe auf „abnahme kampagne“, Kommentar mit Name und
 * Link. Ein Fehler hier ist eine Zeile in der Quittung – die Kampagne steht.
 */
export async function closeBriefAction(
  taskId: string,
  campaignName: string,
  adAccount: string,
  campaignId: string,
): Promise<{ error?: string }> {
  try {
    await closeBrief(
      taskId,
      `Kampagne über One angelegt (pausiert): ${campaignName}\n${adsManagerUrl(adAccount, campaignId)}`,
    );
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}
```

- [ ] **Step 2: Read the session on the page**

In `app/campaigns/new/page.tsx`:

Replace the import of `KNOWN_INITIALS` with:

```ts
import { cookies } from "next/headers";
import { initialsOf } from "@/lib/naming";
import { openSession, SESSION_COOKIE, sessionSecret } from "@/lib/session";
```

After `const { customers } = await listCustomers();` add:

```ts
  // Das Kürzel im Kampagnennamen kommt aus dem Login. Der Proxy lässt ohne
  // Sitzung niemanden bis hierher; null bleibt möglich, wenn sie dazwischen
  // abläuft – dann steht das Kürzel-Feld leer und wird unter Optional gefüllt.
  const person = await openSession((await cookies()).get(SESSION_COOKIE)?.value, sessionSecret());
```

Replace `knownInitials={[...KNOWN_INITIALS]}` in the JSX with:

```tsx
          initials={initialsOf(person?.name ?? "")}
          email={person?.email ?? ""}
```

Also update the `Blattkopf` `stand` copy to: `"Wählt einen Auftrag aus ClickUp, baut den Vorschlag, legt alles pausiert an."`

`Wizard`'s props type does not yet have `initials`/`email`; TypeScript will complain until Task 10. To keep the tree compiling in between, in `wizard.tsx` change `knownInitials: string[]` in `WizardProps` to `initials: string; email: string;` and replace the two uses of `knownInitials` in the Kürzel `Selector` (step 3) with a plain `TextInput` bound to `state.initials` (the `Selector` block is deleted in Task 10 anyway):

```tsx
                <TextInput
                  label="Kürzel im Namen"
                  value={state.initials}
                  onChange={(initials) => setState((s) => ({ ...s, initials }))}
                  placeholder="z. B. MW"
                  description="Steht am Ende des Namens."
                  width="100%"
                />
```

and delete the sibling "Anderes Kürzel" `TextInput`. Remove `KNOWN_INITIALS` from `lib/naming.ts` and its test in `lib/naming.test.ts` (the `KNOWN_INITIALS` test block, if present; grep first).

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit -p .`
Expected: no errors. (If `Selector` is now unused in wizard.tsx, remove it from the import.)

- [ ] **Step 4: Commit**

```bash
git add app/campaigns/actions.ts app/campaigns/new/page.tsx app/campaigns/new/wizard.tsx lib/naming.ts lib/naming.test.ts
git commit -m "feat: Server Actions für Auftragsliste, Auftrag und ClickUp-Abschluss; Kürzel aus der Sitzung

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: State – Benefits, Herkunft, `applyBrief`, Entwürfe v2

**Files:**
- Modify: `app/campaigns/new/state.ts`
- Modify: `app/campaigns/new/state.test.ts` (append)

**Interfaces:**
- Consumes: `AssembledBrief`, `Source` (Task 4)
- Produces:
  - `WizardState` gains `benefits: string; sources: Sources; taskId?: string; notes?: string; formHint?: string; driveFolderId?: string`
  - `type SourceField = "clientName" | "roles" | "benefits" | "location" | "dailyBudget" | "spendCap" | "initials"`
  - `type Sources = Partial<Record<SourceField, Source>>`
  - `DEFAULT_DAILY_BUDGET = 17`
  - `applyBrief(state: WizardState, brief: AssembledBrief): WizardState`
  - `edited(state: WizardState, field: SourceField, patch: Partial<WizardState>): WizardState`
  - `initialState(adAccount, business, initials)` sets `sources.initials = "session"` when `initials` is non-empty
  - `useWizardState` no longer reads/writes `INITIALS_KEY`

- [ ] **Step 1: Write the failing tests**

Append to `app/campaigns/new/state.test.ts` (extend the import from `./state` with `applyBrief, edited, DEFAULT_DAILY_BUDGET` and add `import type { AssembledBrief } from "@/lib/brief";`):

```ts
const brief: AssembledBrief = {
  taskId: "t1",
  clientName: { value: "MeVita Pflegedienst GmbH", source: "clickup" },
  roles: { value: ["PFK"], source: "clickup" },
  benefits: { value: "33 Urlaubstage\nJobrad", source: "onboarding" },
  location: { value: { addressString: "Mühlgasse 24, 71272 Renningen" }, source: "clickup" },
  formHint: { value: "Renningen", source: "clickup" },
  dailyBudgetEuros: { value: 35, source: "clickup" },
  spendCapEuros: { value: 2435, source: "clickup" },
  driveFolderId: { value: "k", source: "clickup" },
  notes: "neu anlegen",
  warnings: [],
};

test("applyBrief füllt ein leeres Formular und merkt sich je Feld die Herkunft", () => {
  const s = applyBrief(initialState("act_1", "", "KF"), brief);
  expect(s.business).toBe("MeVita Pflegedienst GmbH");
  expect(s.roles).toEqual(["PFK"]);
  expect(s.benefits).toBe("33 Urlaubstage\nJobrad");
  expect(s.adSets[0].addressString).toBe("Mühlgasse 24, 71272 Renningen");
  expect(s.dailyBudgetEuros).toBe(35);
  expect(s.spendCapEuros).toBe(2435);
  expect(s.taskId).toBe("t1");
  expect(s.notes).toBe("neu anlegen");
  expect(s.formHint).toBe("Renningen");
  expect(s.driveFolderId).toBe("k");
  expect(s.sources).toEqual({
    initials: "session",
    clientName: "clickup",
    roles: "clickup",
    benefits: "onboarding",
    location: "clickup",
    dailyBudget: "clickup",
    spendCap: "clickup",
  });
});

test("applyBrief überschreibt nichts, was schon angefasst ist", () => {
  const before = {
    ...initialState("act_1", "Anderer Kunde", "KF"),
    roles: ["HK"],
    benefits: "eigene",
    dailyBudgetEuros: 20,
  };
  before.adSets[0].addressString = "Hier";
  const s = applyBrief(before, brief);
  expect(s.business).toBe("Anderer Kunde");
  expect(s.roles).toEqual(["HK"]);
  expect(s.benefits).toBe("eigene");
  expect(s.dailyBudgetEuros).toBe(20);
  expect(s.adSets[0].addressString).toBe("Hier");
  expect(s.spendCapEuros).toBe(2435);
  expect(s.sources).toEqual({ initials: "session", spendCap: "clickup" });
});

test("edited nimmt dem Feld sein Etikett", () => {
  const s = applyBrief(initialState("act_1", "", "KF"), brief);
  const t = edited(s, "roles", { roles: ["FK"] });
  expect(t.roles).toEqual(["FK"]);
  expect(t.sources.roles).toBeUndefined();
  expect(t.sources.benefits).toBe("onboarding");
});

test("das Tagesbudget beginnt beim Hausstandard", () => {
  expect(initialState().dailyBudgetEuros).toBe(DEFAULT_DAILY_BUDGET);
  expect(initialState().sources).toEqual({});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test app/campaigns/new/state.test.ts`
Expected: FAIL, `applyBrief` not exported.

- [ ] **Step 3: Implement**

In `app/campaigns/new/state.ts`:

Add the import:

```ts
import type { AssembledBrief, Source } from "@/lib/brief";
```

Extend `WizardState` (after `spendCapEuros?: number;`):

```ts
  /**
   * Was der Assistent nicht aus einer API weiß und was in jedem Text steht:
   * die Benefits des Arbeitgebers, eine je Zeile. Aus der Onboarding-Tabelle
   * gelesen oder getippt – im Entwurf, nicht mehr im Dialog.
   */
  benefits: string;
  /** Woher ein vorbelegtes Feld stammt. Verschwindet, sobald jemand es ändert (edited). */
  sources: Sources;
  /** Die ClickUp-Aufgabe, aus der dieser Entwurf kommt – nach dem Anlegen wechselt sie den Status. */
  taskId?: string;
  /** Die Beschreibung der Aufgabe, wörtlich – für Menschen, nicht für Felder. */
  notes?: string;
  /** Nach welchem Namen oder Ort das Lead-Formular zu wählen ist. */
  formHint?: string;
  /** Der Kundenordner in Drive, wenn bekannt – das Regal startet dann dort. */
  driveFolderId?: string;
```

Add before `WizardState`:

```ts
export type SourceField =
  | "clientName"
  | "roles"
  | "benefits"
  | "location"
  | "dailyBudget"
  | "spendCap"
  | "initials";
export type Sources = Partial<Record<SourceField, Source>>;

/** Hausstandard – und der Vergleichswert, an dem applyBrief „unangefasst“ erkennt. */
export const DEFAULT_DAILY_BUDGET = 17;
```

Change `initialState`:

```ts
export const initialState = (adAccount = "", business = "", initials = ""): WizardState => ({
  adAccount,
  business,
  roles: [],
  roleFreeText: "",
  startDate: new Date().toISOString().slice(0, 10),
  initials,
  campaignName: "",
  nameEdited: false,
  dailyBudgetEuros: DEFAULT_DAILY_BUDGET,
  benefits: "",
  sources: initials ? { initials: "session" } : {},
  adSets: [emptyAdSet(0)],
});
```

Add after `initialState`:

```ts
/**
 * Der Auftrag ins Formular – aber nur in Felder, die noch auf dem
 * Ausgangswert stehen. Dieselbe Regel wie untouchedPrefillPatch in wizard.tsx:
 * ein fortgesetzter Entwurf, an dem schon jemand gearbeitet hat, wird nicht
 * überschrieben, nur ergänzt. Jedes gefüllte Feld bekommt seine Herkunft.
 */
export function applyBrief(state: WizardState, brief: AssembledBrief): WizardState {
  const sources: Sources = { ...state.sources };
  const next: WizardState = {
    ...state,
    taskId: brief.taskId,
    notes: brief.notes,
    formHint: brief.formHint?.value,
    driveFolderId: brief.driveFolderId?.value,
  };
  if (brief.clientName && !state.business.trim()) {
    next.business = brief.clientName.value;
    sources.clientName = brief.clientName.source;
  }
  if (brief.roles && !state.roles.length) {
    next.roles = brief.roles.value;
    sources.roles = brief.roles.source;
  }
  if (brief.roleFreeText && !state.roleFreeText.trim()) next.roleFreeText = brief.roleFreeText.value;
  if (brief.benefits && !state.benefits.trim()) {
    next.benefits = brief.benefits.value;
    sources.benefits = brief.benefits.source;
  }
  if (brief.dailyBudgetEuros && state.dailyBudgetEuros === DEFAULT_DAILY_BUDGET) {
    next.dailyBudgetEuros = brief.dailyBudgetEuros.value;
    sources.dailyBudget = brief.dailyBudgetEuros.source;
  }
  if (brief.spendCapEuros && state.spendCapEuros === undefined) {
    next.spendCapEuros = brief.spendCapEuros.value;
    sources.spendCap = brief.spendCapEuros.source;
  }
  const first = state.adSets[0];
  if (brief.location && first && first.addressString === "" && !first.place) {
    next.adSets = state.adSets.map((set, i) =>
      i === 0 ? { ...set, addressString: brief.location!.value.addressString } : set,
    );
    sources.location = brief.location.source;
  }
  return { ...next, sources };
}

/** Eine Änderung von Hand: der Wert wechselt, das Herkunftsetikett fällt. */
export function edited(state: WizardState, field: SourceField, patch: Partial<WizardState>): WizardState {
  const { [field]: _gone, ...sources } = state.sources;
  return { ...state, ...patch, sources };
}
```

Change the drafts key and drop the initials key:

```ts
const DRAFTS_KEY = "medarbeiter:new-campaign:drafts:v2";
```

Delete the `INITIALS_KEY` constant and its comment. In `hydrate`, add `benefits: state.benefits ?? "", sources: state.sources ?? {},` to the returned object. In `useWizardState`:

- In the first `useEffect`, delete `const initials = localStorage.getItem(INITIALS_KEY) ?? "";` and replace every `initials` use with `defaults.initials` (the `hydrate(mine.state, defaults.initials)` call and the `else if (initials)` branch becomes `else setState((s) => ({ ...s, initials: defaults.initials }))`). Add `defaults.initials` to the effect's dependency comment; keep `[]` as deps (defaults are stable per page load).
- In the second `useEffect`, delete the line `if (state.initials) localStorage.setItem(INITIALS_KEY, state.initials);`.
- The legacy `KEY` migration block (sessionStorage v3 single draft) can stay as is; it is harmless.

- [ ] **Step 4: Run tests and type-check**

Run: `bun test app/campaigns/new/state.test.ts && bunx tsc --noEmit -p .`
Expected: PASS; tsc may now report `benefits`/`sources` missing in a few `WizardState` literals in tests and in `wizard.tsx` — fix the tests by spreading `initialState()`; wizard.tsx compiles because it spreads state.

- [ ] **Step 5: Commit**

```bash
git add app/campaigns/new/state.ts app/campaigns/new/state.test.ts
git commit -m "feat: Assistenten-State kennt Benefits, Herkunft je Feld und den Auftrag; Entwürfe v2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Neu erschienene Formulare erkennen (`newlyAppeared`)

**Files:**
- Modify: `lib/forms.ts` (append)
- Modify: `lib/forms.test.ts` (append)

**Interfaces:**
- Produces: `newlyAppeared(before: ReadonlySet<string>, now: LeadForm[]): LeadForm | undefined`; `matchFormHint(forms: LeadForm[], hint: string): LeadForm | undefined`

- [ ] **Step 1: Write the failing tests**

Append to `lib/forms.test.ts`:

```ts
import { matchFormHint, newlyAppeared, type LeadForm } from "./forms";

const form = (id: string, name: string): LeadForm => ({ id, name, status: "ACTIVE" });

test("newlyAppeared: das erste Formular, das vorher nicht da war", () => {
  const before = new Set(["1", "2"]);
  expect(newlyAppeared(before, [form("1", "a"), form("3", "neu"), form("2", "b")])?.id).toBe("3");
  expect(newlyAppeared(before, [form("1", "a")])).toBeUndefined();
});

test("matchFormHint: genau ein unscharfer Treffer, sonst nichts", () => {
  const forms = [form("1", "PDL Kampagne Renningen 09/26"), form("2", "PFK Waldenbuch"), form("3", "PFK Renningen alt")];
  expect(matchFormHint(forms, "Waldenbuch")?.id).toBe("2");
  expect(matchFormHint(forms, "Renningen")).toBeUndefined();
  expect(matchFormHint(forms, "Stuttgart")).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/forms.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `lib/forms.ts` (add `import { fuzzyCustomerMatch } from "./customers";` at the top):

```ts
/**
 * Formulare entstehen im Baukasten, in einem anderen Tab. Dieser hier merkt
 * sich, welche IDs die Seite beim Öffnen hatte, und liest nach – das erste
 * Formular, das vorher nicht da war, ist das gerade gebaute.
 */
export function newlyAppeared(before: ReadonlySet<string>, now: LeadForm[]): LeadForm | undefined {
  return now.find((f) => !before.has(f.id));
}

/**
 * „Renningen Formular auswählen“ aus der Aufgabe: das Formular, dessen Name
 * den Hinweis trägt – aber nur bei genau einem Treffer. Zwei sind eine Wahl,
 * und die trifft der Assistent nicht.
 */
export function matchFormHint(forms: LeadForm[], hint: string): LeadForm | undefined {
  const hits = forms.filter((f) => fuzzyCustomerMatch(f.name, hint));
  return hits.length === 1 ? hits[0] : undefined;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/forms.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/forms.ts lib/forms.test.ts
git commit -m "feat: neu gebaute Lead-Formulare erkennen, Formular-Hinweis aus der Aufgabe abgleichen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Drive-Dateien holen als Modul, dann das Drive-Regal

**Files:**
- Create: `app/campaigns/new/drive-fetch.ts`
- Modify: `app/campaigns/new/drive-dialog.tsx` (`take()` uses the module)
- Create: `app/campaigns/new/drive-shelf.tsx`

**Interfaces:**
- Consumes: `DriveFile` from `lib/drive.ts`; `DriveSearch` from `app/api/drive/route.ts`; `createGate` from `lib/gate.ts`; `DriveDialog`
- Produces:
  - `fetchDriveFiles(wanted: DriveFile[], onProgress?: (done: number, total: number) => void): Promise<{ files: File[]; failed: string[] }>`
  - `DriveShelf({ business, folderId, taken, onFiles }: { business: string; folderId?: string; taken: ReadonlySet<string>; onFiles: (files: File[]) => void })`

- [ ] **Step 1: Extract the download loop**

Create `app/campaigns/new/drive-fetch.ts`:

```ts
/**
 * Drive-Dateien in den Browser holen, drei auf einmal – mehr hieße mehr Videos
 * zugleich im Speicher. Geteilt von Dialog und Regal; wer die Datei danach
 * bekommt, sieht ein gewöhnliches File-Objekt, wie vom Finder.
 */
import type { DriveFile } from "@/lib/drive";
import { createGate } from "@/lib/gate";

const DOWNLOAD_LANES = 3;

export async function fetchDriveFiles(
  wanted: DriveFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ files: File[]; failed: string[] }> {
  const gate = createGate(DOWNLOAD_LANES);
  const files: File[] = [];
  const failed: string[] = [];
  let done = 0;
  await Promise.all(
    wanted.map(async (m) => {
      await gate.acquire();
      try {
        const res = await fetch(`/api/drive?file=${encodeURIComponent(m.id)}`);
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        files.push(new File([await res.blob()], m.name, { type: m.mimeType }));
      } catch {
        failed.push(m.name);
      } finally {
        gate.release();
        onProgress?.(++done, wanted.length);
      }
    }),
  );
  return { files, failed };
}
```

In `drive-dialog.tsx`, replace the body of `take` with:

```ts
  const take = async () => {
    const wanted = [...selected.values()];
    if (!wanted.length) return;
    setFetching({ done: 0, total: wanted.length });
    const { files, failed } = await fetchDriveFiles(wanted, (done, total) => setFetching({ done, total }));
    setFetching(null);
    if (failed.length)
      toast({ type: "error", body: <div>{`Nicht aus Drive geladen: ${failed.join(", ")}`}</div> });
    if (files.length) onFiles(files);
    onOpenChange(false);
  };
```

Add `import { fetchDriveFiles } from "./drive-fetch";`, delete `DOWNLOAD_LANES` and the `createGate` import from the dialog.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 3: Write the shelf**

Create `app/campaigns/new/drive-shelf.tsx`:

```tsx
"use client";

/**
 * Das Drive-Regal: der Kundenordner, schon geöffnet, direkt im Vorschlag.
 * Vorher lag zwischen „Dateien wählen“ und den Videos ein Dialog, eine Suche
 * und ein Klick durch die Ordner – dabei weiß lib/drive.ts längst, wo sie
 * liegen (und ClickUp sagt es manchmal sogar). Nichts geht ohne Klick zu Meta:
 * „Alle übernehmen“ ist der eine, den es braucht; einzelne Kacheln gehen auch.
 * Schon übernommene Dateien sind ausgegraut – der zweite Klick lädt nichts
 * doppelt. Der Dialog bleibt für den Fall, dass der Tipp falsch ist.
 */

import { useEffect, useState } from "react";
import { Banner, Button, Skeleton, Text, useToast } from "@astryxdesign/core";
import { FolderSimpleIcon, ImageIcon, PlayIcon } from "@phosphor-icons/react";
import type { DriveSearch } from "@/app/api/drive/route";
import type { DriveFile } from "@/lib/drive";
import { plural } from "@/lib/labels";
import { DriveDialog } from "./drive-dialog";
import { fetchDriveFiles } from "./drive-fetch";

const FOLDER = "application/vnd.google-apps.folder";
const isMedia = (f: DriveFile) => f.mimeType !== FOLDER;

export function DriveShelf({
  business,
  folderId,
  taken,
  onFiles,
}: {
  business: string;
  /** Aus ClickUp – dann startet das Regal dort statt bei der Namenssuche. */
  folderId?: string;
  /** Dateinamen, die schon in der Anzeigengruppe liegen (Anzeigen, Ablage, laufende Uploads). */
  taken: ReadonlySet<string>;
  onFiles: (files: File[]) => void;
}) {
  const toast = useToast();
  const [path, setPath] = useState<DriveFile[]>([]);
  const [entries, setEntries] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [fetching, setFetching] = useState<{ done: number; total: number } | null>(null);
  const [dialog, setDialog] = useState(false);

  useEffect(() => {
    if (!business.trim() && !folderId) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    const params = folderId ? { land: folderId } : { q: business.trim() };
    fetch(`/api/drive?${new URLSearchParams(params)}`)
      .then(async (res) => {
        const json = (await res.json()) as DriveSearch & { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setPath(json.landed?.path ?? []);
        setEntries(json.landed?.entries ?? []);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [business, folderId]);

  const media = entries.filter(isMedia);
  const open = media.filter((m) => !taken.has(m.name));

  const take = async (wanted: DriveFile[]) => {
    if (!wanted.length || fetching) return;
    setFetching({ done: 0, total: wanted.length });
    const { files, failed } = await fetchDriveFiles(wanted, (done, total) => setFetching({ done, total }));
    setFetching(null);
    if (failed.length)
      toast({ type: "error", body: <div>{`Nicht aus Drive geladen: ${failed.join(", ")}`}</div> });
    if (files.length) onFiles(files);
  };

  return (
    <div className="bg-surface-secondary border-line space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FolderSimpleIcon size={18} weight="bold" className="text-ink-500 shrink-0" aria-hidden />
          <Text type="supporting" as="span" className="truncate">
            {loading
              ? "Drive-Ordner wird gesucht…"
              : path.length
                ? path.map((p) => p.name).join(" › ")
                : "Kein Drive-Ordner gefunden"}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {open.length > 0 && (
            <Button
              size="sm"
              label={
                fetching
                  ? `${fetching.done} / ${fetching.total} geladen…`
                  : `Alle übernehmen (${open.length})`
              }
              isLoading={fetching !== null}
              onClick={() => take(open)}
            />
          )}
          <Button size="sm" variant="secondary" label="Anderen Ordner wählen" onClick={() => setDialog(true)} />
        </div>
      </div>

      {error && <Banner status="error" title="Drive nicht erreichbar" description={error} />}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={96} width="100%" radius={2} index={i} />
          ))}
        </div>
      ) : media.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
          {media.map((m) => {
            const done = taken.has(m.name);
            const video = m.mimeType.startsWith("video/");
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={done || fetching !== null}
                  aria-label={done ? `${m.name} – schon übernommen` : `${m.name} übernehmen`}
                  onClick={() => take([m])}
                  className={[
                    "border-line bg-surface relative block aspect-square w-full overflow-hidden rounded-lg border text-left",
                    "focus-visible:ring-focus outline-none focus-visible:ring-2",
                    done ? "cursor-default opacity-40" : "hover:border-gold-500 cursor-pointer",
                  ].join(" ")}
                >
                  {m.hasThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/drive?thumb=${encodeURIComponent(m.id)}`} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="text-ink-300 flex size-full items-center justify-center">
                      {video ? <PlayIcon size={28} /> : <ImageIcon size={28} />}
                    </span>
                  )}
                  <span className="bg-ink-900/70 absolute inset-x-0 bottom-0 truncate px-1.5 py-0.5 text-[11px] text-white">
                    {m.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        !error && (
          <Text type="supporting" as="p">
            {path.length
              ? "In diesem Ordner liegen keine Videos oder Bilder."
              : "Dateien unten hineinziehen oder einen Ordner wählen."}
          </Text>
        )
      )}
      {media.length > 0 && (
        <Text type="supporting" as="p" className="text-xs">
          {plural(media.length, "Datei", "Dateien")}
          {open.length < media.length && ` · ${media.length - open.length} schon übernommen`}
        </Text>
      )}

      <DriveDialog isOpen={dialog} onOpenChange={setDialog} business={business} onFiles={onFiles} />
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p .`
Expected: clean. (`plural` signature: check `lib/labels.ts`; it is `plural(n, singular, plural)`.)

- [ ] **Step 5: Commit**

```bash
git add app/campaigns/new/drive-fetch.ts app/campaigns/new/drive-dialog.tsx app/campaigns/new/drive-shelf.tsx
git commit -m "feat: Drive-Regal im Vorschlag – Kundenordner offen, Alle übernehmen, Dialog als Ausweg

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `AdSetBlock` – Benefits als Prop, Generieren beim Betreten, Formular-Überwachung, Regal

**Files:**
- Modify: `app/campaigns/new/ad-set-block.tsx`
- Delete: `app/campaigns/new/benefits-dialog.tsx`

**Interfaces:**
- Consumes: `newlyAppeared`, `matchFormHint` (Task 7); `DriveShelf` (Task 8); `Source` (Task 4)
- Produces: `AdSetBlock` props change:
  - removed: none
  - added: `benefits: string; benefitsSource?: Source; onBenefitsChange: (v: string) => void; autoGenerate: boolean; formHint?: string; driveFolderId?: string`

- [ ] **Step 1: Replace the dialogs with a Benefits field and direct buttons**

In `ad-set-block.tsx`:

1. Delete `import { BenefitsDialog } from "./benefits-dialog";`. Add:

```ts
import { matchFormHint, newlyAppeared } from "@/lib/forms";
import type { Source } from "@/lib/brief";
import { DriveShelf } from "./drive-shelf";
import { Herkunft } from "./herkunft";
```

(`Herkunft` is created in Task 10, step 1; create it first if you execute this task standalone: it is a 15-line component.)

2. Extend the props type and destructuring:

```ts
  /** Die Benefits – im Entwurf, nicht mehr im Dialog. Einmal für alle drei Generatoren. */
  benefits: string;
  benefitsSource?: Source;
  onBenefitsChange: (benefits: string) => void;
  /** Beim ersten Anzeigen mit leeren Texten sofort generieren – der Vorschlag ist ein Vorschlag. */
  autoGenerate: boolean;
  /** Aus der Aufgabe: nach welchem Namen oder Ort das Formular zu wählen ist. */
  formHint?: string;
  /** Aus ClickUp: das Regal startet dort statt bei der Namenssuche. */
  driveFolderId?: string;
  /** Herkunft des vorbelegten Standorts – Etikett unter dem Standortfeld (nur erste Anzeigengruppe). */
  locationSource?: Source;
```

Under `<LocationField … />` add `<Herkunft source={locationSource} />`.

3. Delete the state lines `bodiesDialog`, `titlesDialog`, `descriptionDialog`, and `const [benefits, setBenefits] = useState("");`. The three `generate*` functions keep reading `benefits` — now the prop.

4. Delete the three `<BenefitsDialog … />` blocks. Change the three buttons' `onClick` to call the generators directly: `onClick={generateBodies}`, `onClick={generateTitles}`, `onClick={generateDescription}`.

5. Above the first `TextListField` (inside `<FieldsetSection legend="Texte">`'s `div`), insert:

```tsx
          <div className="max-w-2xl space-y-1">
            <TextArea
              label="Benefits des Arbeitgebers"
              value={benefits}
              onChange={onBenefitsChange}
              rows={5}
              width="100%"
              description="Eine je Zeile – sie stehen wörtlich in Primärtexten, Überschriften und Beschreibung."
              placeholder={"z. B.\nWeihnachts- & Urlaubsgeld\n30 Urlaubstage\nJobRad"}
            />
            <Herkunft source={benefitsSource} />
          </div>
```

6. Auto-generate once. After the `generateDescription` definition add:

```ts
  // Der Vorschlag füllt sich selbst: leere Texte beim ersten Anzeigen heißen
  // generieren, ohne dass jemand drei Knöpfe drückt. Nur einmal je Block, und
  // nur bei leeren Feldern – ein wiederhergestellter Entwurf behält seine Texte.
  const generated = useRef(false);
  useEffect(() => {
    if (!autoGenerate || generated.current) return;
    const empty = (xs: string[]) => xs.every((x) => !x.trim());
    if (!empty(value.bodies) || !empty(value.titles) || value.description.trim()) return;
    generated.current = true;
    void generateBodies();
    void generateTitles();
    void generateDescription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate]);
```

- [ ] **Step 2: Watch the page's forms**

Make `refreshForms` return the list:

```ts
  const refreshForms = async (refresh = false): Promise<LeadForm[]> => {
    setFormsLoading(true);
    const res = await listFormsAction(pageId, refresh);
    setForms(res.forms);
    setFormsError(res.error);
    setFormsLoading(false);
    return res.forms;
  };
```

Replace the mount effect `useEffect(() => { if (pageId) refreshForms(); }, [pageId])` with:

```ts
  // Beim Öffnen: laden, die IDs merken (das ist „vorher“ für die Erkennung),
  // und den Hinweis aus der Aufgabe abgleichen – ein eindeutiger Treffer wird
  // gewählt, mit Etikett.
  const seen = useRef<Set<string>>();
  const [detected, setDetected] = useState<{ name: string; how: "neu" | "hinweis" }>();
  useEffect(() => {
    if (!pageId) return;
    void refreshForms().then((list) => {
      seen.current = new Set(list.map((f) => f.id));
      if (value.formId || !formHint) return;
      const hit = matchFormHint(list, formHint);
      if (hit) {
        onChange({ formId: hit.id });
        setDetected({ name: hit.name, how: "hinweis" });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Das Formular entsteht im Baukasten, in einem anderen Tab. Solange hier
  // keins gewählt ist: bei Rückkehr (focus) und alle 30 s nachlesen – dasselbe
  // Muster wie die Lead-TOS-Schleife in wizard.tsx. Das erste, das vorher
  // nicht da war, wird gewählt; danach ist Ruhe.
  const formId = value.formId;
  useEffect(() => {
    if (!pageId || formId) return;
    const check = async () => {
      const before = seen.current;
      if (!before) return;
      const list = await refreshForms(true);
      const fresh = newlyAppeared(before, list);
      if (!fresh) return;
      onChange({ formId: fresh.id });
      setDetected({ name: fresh.name, how: "neu" });
    };
    const id = setInterval(check, 30_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, formId]);
```

Under the form `Typeahead`, add:

```tsx
        {detected && value.formId && (
          <Text type="supporting" as="p" aria-live="polite">
            {detected.how === "neu"
              ? `Neu erkannt: „${detected.name}“ – gerade in Meta gebaut.`
              : `Aus der Aufgabe gewählt: „${detected.name}“.`}
          </Text>
        )}
        {!value.formId && pageId && (
          <Text type="supporting" as="p">
            Baue das Formular in Meta — sobald es dort steht, wird es hier erkannt und gewählt.
          </Text>
        )}
```

Rename the builder button label from "Formular in Meta erstellen" to "Formular in Meta bauen".

- [ ] **Step 3: Put the shelf above the picker**

In the `<FieldsetSection legend="Inhalt">`, directly above `<FilePicker …/>`, insert:

```tsx
        <DriveShelf
          business={business}
          folderId={driveFolderId}
          taken={taken}
          onFiles={onFiles}
        />
```

and compute `taken` after `const uploads = useUploads(value.id);`:

```ts
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
```

Remove the "Aus Google Drive" button and the `DriveDialog` from `FilePicker` (the shelf owns the dialog now); drop the `business` prop from `FilePicker` and its `drive` state.

- [ ] **Step 4: Delete the dialog file, type-check**

```bash
git rm app/campaigns/new/benefits-dialog.tsx
bunx tsc --noEmit -p .
```

Expected: errors only in `wizard.tsx` (missing new props on `AdSetBlock`) — Task 10 fixes them. If `Herkunft` does not exist yet, create it now exactly as in Task 10 step 1.

- [ ] **Step 5: Commit**

```bash
git add -A app/campaigns/new/ad-set-block.tsx app/campaigns/new/herkunft.tsx
git commit -m "feat: Anzeigengruppe generiert beim Betreten, erkennt das neu gebaute Formular, zeigt das Drive-Regal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Die drei Schirme – `herkunft.tsx`, `auftrag.tsx`, `vorschlag.tsx`, `wizard.tsx`

**Files:**
- Create: `app/campaigns/new/herkunft.tsx`
- Create: `app/campaigns/new/auftrag.tsx`
- Create: `app/campaigns/new/vorschlag.tsx`
- Rewrite: `app/campaigns/new/wizard.tsx`

**Interfaces:**
- Consumes: everything above; `Stepper`, `Entwuerfe`, `Preview`, `ReceiptPanel`, `useLaunch`, `Angaben`, `Infotafel`, `LeadgenTosAlert` logic (moved), `campaignName`, `resolveClientByName`, `fuzzyCustomerMatch`
- Produces:
  - `Herkunft({ source }: { source?: Source })`
  - `Auftrag({ email, picking, onPick, onWithout })`
  - `KundeWahl({ … })` (the customer typeahead block, moved out of wizard.tsx)
  - `Vorschlag({ … })` (head + optional)
  - `Wizard({ accounts, clients, defaultAccount, defaultBusiness, initials, email })`

- [ ] **Step 1: Herkunft**

Create `app/campaigns/new/herkunft.tsx`:

```tsx
"use client";

import { Badge } from "@astryxdesign/core";
import type { Source } from "@/lib/brief";

const LABEL: Record<Source, string> = {
  clickup: "aus ClickUp",
  onboarding: "aus der Onboarding-Tabelle",
  previous: "aus der letzten Kampagne",
  session: "aus der Anmeldung",
};

/**
 * Woher ein vorbelegter Wert stammt. Ein Etikett, kein Satz: es steht an
 * jedem gefüllten Feld, und wer es liest, soll den Wert prüfen, nicht die
 * Herkunft studieren. Verschwindet, sobald jemand das Feld ändert (edited).
 */
export function Herkunft({ source }: { source?: Source }) {
  if (!source) return null;
  return <Badge variant="neutral" label={LABEL[source]} className="text-xs" />;
}
```

- [ ] **Step 2: Auftrag and KundeWahl**

Create `app/campaigns/new/auftrag.tsx`:

```tsx
"use client";

/**
 * Schirm 1: der Auftrag. Keine Felder – eine Liste der ClickUp-Aufgaben im
 * Status „kampagne anlegen“, eigene zuerst. Ein Klick, und der Vorschlag baut
 * sich. Wer keine Aufgabe hat, geht unten den alten Weg: Kunde wählen, Rest
 * leer.
 */

import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Card, Divider, Heading, List, ListItem, Section, Skeleton, Text } from "@astryxdesign/core";
import type { Brief } from "@/lib/clickup";
import { briefsAction } from "../actions";

const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function Auftrag({
  email,
  picking,
  onPick,
  onWithout,
}: {
  /** Die angemeldete Person – ihre Aufgaben stehen oben. */
  email: string;
  /** Die Aufgabe, deren Vorschlag gerade gebaut wird. */
  picking?: string;
  onPick: (taskId: string) => void;
  onWithout: () => void;
}) {
  const [briefs, setBriefs] = useState<Brief[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    briefsAction().then((res) => {
      if (cancelled) return;
      setBriefs(res.briefs);
      setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    if (!briefs) return [];
    const mine = (b: Brief) => b.assignees.some((a) => a.toLowerCase() === email.toLowerCase());
    return [...briefs].sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.createdAt - a.createdAt);
  }, [briefs, email]);

  return (
    <Card elevation="low" padding={0}>
      <Section padding={6} paddingBlock={4}>
        <div className="flex flex-col gap-1">
          <Heading level={2}>Welche Kampagne ist dran?</Heading>
          <Text type="supporting" color="secondary" as="p" className="max-w-prose">
            Die Aufgaben aus ClickUp im Status „Kampagne anlegen“. Ein Klick liest Budget, Rollen,
            Standort und Benefits zusammen — du korrigierst, statt zu tippen.
          </Text>
        </div>
      </Section>
      <Divider />
      {error && (
        <Section padding={6} paddingBlock={4}>
          <Banner status="error" title="ClickUp nicht erreichbar" description={error} />
        </Section>
      )}
      {!briefs ? (
        <div className="space-y-3 p-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={44} width="100%" radius={2} index={i} />
          ))}
        </div>
      ) : sorted.length ? (
        <List hasDividers density="spacious">
          {sorted.map((b) => (
            <ListItem
              key={b.taskId}
              label={b.customer || b.name}
              description={[
                b.customer ? b.name : undefined,
                b.assignees.join(", ") || "niemand zuständig",
                b.dailyBudgetEuros !== undefined ? `${money.format(b.dailyBudgetEuros)} / Tag` : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
              endContent={
                <Button
                  size="sm"
                  label="Vorschlag erstellen"
                  isLoading={picking === b.taskId}
                  isDisabled={Boolean(picking)}
                  onClick={() => onPick(b.taskId)}
                />
              }
            />
          ))}
        </List>
      ) : (
        !error && (
          <Section padding={6} paddingBlock={4}>
            <Text type="supporting" as="p">
              Keine Aufgabe im Status „Kampagne anlegen“.
            </Text>
          </Section>
        )
      )}
      <Divider />
      <Section variant="muted" padding={6} paddingBlock={3}>
        <Button variant="ghost" size="sm" label="Ohne Aufgabe beginnen" onClick={onWithout} isDisabled={Boolean(picking)} />
      </Section>
    </Card>
  );
}
```

Now move the customer block. Append to `auftrag.tsx` a `KundeWahl` component containing, verbatim from the current `wizard.tsx` step-1 JSX: the `Typeahead label="Beworbener Kunde"` with its ref and `⇧K` hint, the reload button, the `LeadgenTosAlert` (move that function here too, with its imports `Banner`, `Button`, `leadgenTosUrl`), and the `Angaben titel="Das steckt hinter dieser Wahl"` table. **Not** the Werbekonto collapsible (moves to Optional). Props:

```ts
export function KundeWahl({
  clientSource, clientItem, onChange, customerFieldRef, reloading, onReload,
  client, accountName, instagramLabel, unmatchedName, onOtherTask,
}: {
  clientSource: SearchSource<ClientItem>;
  clientItem: ClientItem | null;
  onChange: (item: ClientItem | null) => void;
  customerFieldRef: RefObject<HTMLDivElement | null>;
  reloading: boolean;
  onReload: () => void;
  client?: WizardClient;
  accountName?: string;
  instagramLabel?: string;
  /** Der Kundenname aus ClickUp, der in der Meta-Liste nicht gefunden wurde. */
  unmatchedName?: string;
  /** Zurück zur Aufgabenliste – nur, wenn man von dort kam. */
  onOtherTask?: () => void;
})
```

Above the typeahead, when `unmatchedName` is set, render:

```tsx
      <Banner
        status="warning"
        title={`„${unmatchedName}“ steht nicht in der Meta-Kundenliste`}
        description="So heißt der Kunde in ClickUp. Wähle unten die passende Seite — der Kampagnenname bleibt, wie er ist."
      />
```

Below the `Angaben` table, when `onOtherTask` is set: `<Button variant="ghost" size="sm" label="Andere Aufgabe wählen" onClick={onOtherTask} />`.

Export the `WizardClient` and `ClientItem` types from `auftrag.tsx` (move them out of `wizard.tsx`), plus `fuzzySource` (move as well; `vorschlag.tsx` needs it for the account typeahead).

- [ ] **Step 3: Vorschlag head and Optional**

Create `app/campaigns/new/vorschlag.tsx`:

```tsx
"use client";

/**
 * Schirm 2, oberer Teil: der Kampagnenname als Ergebnis, die Rollen (mit
 * Herkunft), das Tagesbudget als Pflichtfeld, die Hinweise aus der Aufgabe.
 * Darunter, eingeklappt, alles Optionale: Werbekonto, Startdatum,
 * Ausgabenlimit, Name von Hand, Kürzel. Die Anzeigengruppen rendert wizard.tsx
 * dazwischen – sie sind die Arbeit, das hier ist der Rahmen.
 */

import type { ReactNode } from "react";
import {
  Banner,
  Button,
  Collapsible,
  DateInput,
  MultiSelector,
  NumberInput,
  Text,
  TextInput,
  Typeahead,
  type ISODateString,
  type SearchSource,
  type SearchableItem,
} from "@astryxdesign/core";
import { ROLES } from "@/lib/naming";
import { Angaben, Infotafel } from "./angaben";
import { Herkunft } from "./herkunft";
import { edited, type SourceField, type WizardState } from "./state";

export type WizardAccount = { id: string; name: string; customerId: string; customerName: string };
export type AccountItem = SearchableItem<WizardAccount> & { auxiliaryData: WizardAccount };

const NAME_EDITED_HINT = "Von Hand geändert — der Name folgt den Feldern nicht mehr.";

export function VorschlagKopf({
  state,
  setState,
  warnings,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  /** Was beim Zusammensetzen nicht gelesen werden konnte (lib/brief.ts). */
  warnings: string[];
}) {
  const set = (field: SourceField, patch: Partial<WizardState>) => setState((s) => edited(s, field, patch));
  return (
    <div className="flex flex-col gap-6">
      {/* Der Name ist ein Ergebnis, keine Eingabe – gerahmt wie ein Wert. */}
      <div className="border-line bg-surface-secondary flex items-center gap-3 rounded-xl border p-2 ps-3">
        <Text type="code" className="min-w-0 flex-1 truncate">
          {state.campaignName || "…"}
        </Text>
        {state.nameEdited && (
          <Button
            variant="ghost"
            size="sm"
            label="Automatisch benennen"
            onClick={() => setState((s) => ({ ...s, nameEdited: false }))}
          />
        )}
      </div>

      {warnings.length > 0 && (
        <Banner
          status="warning"
          title="Nicht alles konnte gelesen werden"
          description={
            <ul className="list-disc space-y-1 pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      )}

      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <MultiSelector
            label="Gesuchte Rollen"
            options={ROLES.map((r) => ({ value: r.code, label: r.label }))}
            value={state.roles}
            onChange={(roles) => set("roles", { roles })}
            placeholder="Rollen wählen…"
            triggerDisplay="badges"
            hasSearch={ROLES.length > 15}
            searchPlaceholder="Rolle suchen…"
            description="Die Kürzel landen im Namen und in den Texten."
            width="100%"
          />
          <Herkunft source={state.sources.roles} />
        </div>
        <TextInput
          label="Weitere Rolle"
          value={state.roleFreeText}
          onChange={(roleFreeText) => setState((s) => ({ ...s, roleFreeText }))}
          placeholder="z. B. Koch"
          description="Für Einzelfälle ohne Kürzel — steht unverändert im Namen."
          width="100%"
        />
        <div className="space-y-1">
          <NumberInput
            label="Tagesbudget"
            value={state.dailyBudgetEuros}
            onChange={(dailyBudgetEuros) => set("dailyBudget", { dailyBudgetEuros })}
            min={1}
            step={0.01}
            units="€"
            isRequired
            description="Gilt für die ganze Kampagne."
            width="100%"
          />
          <Herkunft source={state.sources.dailyBudget} />
        </div>
      </div>

      {state.notes && (
        <Infotafel titel="Hinweise aus der Aufgabe">
          {/* Wörtlich und als Text: das sind Anweisungen für Menschen
              („Creatives von letzter Kampagne nehmen“), keine Felder. */}
          <pre className="text-ink-700 px-2 pb-2 font-sans text-sm whitespace-pre-wrap">{state.notes}</pre>
        </Infotafel>
      )}
    </div>
  );
}

export function Optional({
  state,
  setState,
  accountSource,
  accountItem,
  prefill,
  fixed,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  accountSource: SearchSource<AccountItem>;
  accountItem: AccountItem | null;
  prefill: "loading" | "applied" | "none";
  /** Die Festwerte aus wizard.tsx (FIXED). */
  fixed: [string, string][];
}) {
  const set = (field: SourceField, patch: Partial<WizardState>) => setState((s) => edited(s, field, patch));
  return (
    <Collapsible defaultIsOpen={false} trigger="Optionale Einstellungen">
      <div className="grid max-w-3xl gap-4 pb-2 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Typeahead
            label="Werbekonto (zahlt)"
            placeholder="Werbekonto suchen…"
            searchSource={accountSource}
            value={accountItem}
            onChange={(item) => setState((s) => ({ ...s, adAccount: item?.id ?? "" }))}
            hasEntriesOnFocus
            maxMenuItems={200}
            debounceMs={0}
            emptySearchResultsText="Kein Werbekonto gefunden"
            renderItem={(item) => (
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                <span className="text-ink-500 block truncate text-xs">{item.auxiliaryData.customerName}</span>
              </span>
            )}
            width="100%"
          />
          {prefill !== "none" && (
            <Text type="supporting" as="p" aria-live="polite">
              {prefill === "loading"
                ? "Die letzte Kampagne dieses Kontos wird nach Standort und Radius durchsucht…"
                : "Standort und Radius kommen aus der letzten Kampagne dieses Kontos."}
            </Text>
          )}
        </div>
        <DateInput
          label="Startdatum"
          value={state.startDate as ISODateString}
          onChange={(date) => date && setState((s) => ({ ...s, startDate: date }))}
          description="Steht im Kampagnennamen."
          width="100%"
        />
        <div className="space-y-1">
          <NumberInput
            label="Ausgabenlimit"
            value={state.spendCapEuros ?? null}
            hasClear
            onChange={(v) => set("spendCap", { spendCapEuros: v ?? undefined })}
            min={100}
            step={0.01}
            units="€"
            description="Leer heißt keins; sonst mindestens 100 €."
            width="100%"
          />
          <Herkunft source={state.sources.spendCap} />
        </div>
        <div className="space-y-1">
          <TextInput
            label="Kürzel im Namen"
            value={state.initials}
            onChange={(initials) => set("initials", { initials })}
            placeholder="z. B. MW"
            description="Steht am Ende des Namens."
            width="100%"
          />
          <Herkunft source={state.sources.initials} />
        </div>
        <TextInput
          label="Kampagnenname von Hand"
          value={state.campaignName}
          onChange={(campaignName) => setState((s) => ({ ...s, campaignName, nameEdited: true }))}
          description={state.nameEdited ? NAME_EDITED_HINT : "Baut sich aus Kunde, Rollen, Datum und Kürzel."}
          width="100%"
        />
        <div className="sm:col-span-2">
          <Angaben titel="Feste Einstellungen" rows={fixed} />
        </div>
      </div>
    </Collapsible>
  );
}
```

`state.startDate` is `yyyy-mm-dd` and may be a broken draft value; keep the current `toIsoDate` guard from wizard.tsx (move `toCalendarDate`/`toIsoDate` into this file and use `toIsoDate(state.startDate)` instead of the cast).

- [ ] **Step 4: Rewrite `wizard.tsx`**

Rewrite `app/campaigns/new/wizard.tsx`. Keep from the current file, verbatim: `untouchedPrefillPatch`, `FIXED`, `money`, `LaunchProgressBar`, `IssueChip`, `Step`, the `useWizardState` wiring, the ⇧K effect, the `openSets` handling, the TOS polling effect, the name-composition effect, the prefill effect, `updateAdSets`/`updateAdSet`/`removeAdSet`, the upload-drain effect, `addLocation`, the `issues` memo, `overlaps`, `submitWizard`/`onCreate`, and the whole step-4 JSX (becomes step 3 without the `Angaben` summary tafel). Change:

**Props and imports**

```ts
type WizardProps = {
  accounts: WizardAccount[];
  clients: WizardClient[];
  defaultAccount: string;
  defaultBusiness: string;
  initials: string;
  email: string;
};
```

Import `Auftrag`, `KundeWahl`, `fuzzySource`, `type WizardClient`, `type ClientItem` from `./auftrag`; `VorschlagKopf`, `Optional`, `type WizardAccount`, `type AccountItem` from `./vorschlag`; `applyBrief`, `edited` from `./state`; `briefAction`, `closeBriefAction` from `../actions`.

**Steps**

```ts
const STEPS = ["Auftrag", "Vorschlag", "Anlegen"];
```

**State init** — `useWizardState(initialState(defaultAccount, defaultBusiness, initials))`.

**Screen-1 mode**

```ts
  // Schirm 1 hat zwei Gesichter: die Aufgabenliste, solange kein Kunde
  // feststeht, und die Kundenwahl, sobald einer da ist oder jemand ohne
  // Aufgabe beginnt. `manual` merkt sich das Zweite.
  const [manual, setManual] = useState(false);
  const [picking, setPicking] = useState<string>();
  const [briefError, setBriefError] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);

  const pick = async (taskId: string) => {
    setPicking(taskId);
    setBriefError(undefined);
    const res = await briefAction(taskId);
    setPicking(undefined);
    if (!res.brief) return setBriefError(res.error ?? "Der Auftrag konnte nicht gelesen werden.");
    const brief = res.brief;
    setWarnings(brief.warnings);
    setState((s) => {
      const next = applyBrief(s, brief);
      // Der Kunde aus ClickUp heißt selten exakt wie die Meta-Seite. Exakt,
      // sonst der eine unscharfe Treffer, sonst bleibt der Name stehen und
      // die Kundenwahl zeigt ihn als nicht zugeordnet.
      const exact = resolveClientByName(clients, next.business);
      const fuzzy = exact ? [] : clients.filter((c) => fuzzyCustomerMatch(c.name, next.business));
      const match = exact ?? (fuzzy.length === 1 ? fuzzy[0] : undefined);
      return match ? { ...next, business: match.name } : next;
    });
    setStep("1");
  };
```

Note `resolveClientByName` needs the business in the *updated* state; `applyBrief` only sets it if empty, so compute the match from `next.business` as above.

`prefill` effect: when it applies, also stamp the source:

```ts
        return {
          ...s,
          sources: { ...s.sources, location: "previous" },
          adSets: s.adSets.map((set, i) => (i === 0 ? { ...set, ...patch } : set)),
        };
```

**Client resolution**: unchanged (`resolveClientByName(clients, state.business)`); add `const unmatched = state.business.trim() && !client ? state.business : undefined;`.

**Locking**: `const locked = !client;` stays; `lockedFrom={locked ? 1 : STEPS.length}`.

**Step 0 JSX**

```tsx
        {stepIndex === 0 &&
          (!manual && !state.business && !state.taskId ? (
            <div className="p-6">
              {briefError && <Banner status="error" title="Auftrag nicht gelesen" description={briefError} />}
              <Auftrag email={email} picking={picking} onPick={pick} onWithout={() => setManual(true)} />
            </div>
          ) : (
            <Step
              frage="Für wen wird geworben?"
              satz="Die Facebook-Seite des Kunden trägt die Anzeigen und die Lead-Formulare, sein Name baut den Kampagnennamen."
            >
              <KundeWahl
                clientSource={clientSource}
                clientItem={clientItem}
                onChange={(item) => setState((s) => edited(s, "clientName", { business: item?.auxiliaryData.name ?? "" }))}
                customerFieldRef={customerFieldRef}
                reloading={reloading}
                onReload={reloadClients}
                client={client}
                accountName={account?.name}
                instagramLabel={instagramLabel}
                unmatchedName={unmatched}
                onOtherTask={() => {
                  setManual(false);
                  discard();
                }}
              />
            </Step>
          ))}
```

Layout decision: `Auftrag` is its own `Card` and must not sit inside the outer card. Structure the return as: `Entwuerfe` (if any) → outer `Card` containing only the `Stepper` when on step 0 without a customer → `Auftrag` card below it. From the moment a customer exists (or `manual` is true), the outer card contains `Stepper` + `Step` + footer as today. Concretely: compute `const showsList = stepIndex === 0 && !manual && !state.business && !state.taskId;` and render the `Step`/footer only when `!showsList`.

**Step 1 JSX** (replaces old steps 2 and 3)

```tsx
        {stepIndex === 1 && (
          <Step
            frage="Passt der Vorschlag?"
            satz="Alles unten ist vorbelegt, wo es ging — Etiketten sagen, woher. Standort, Lead-Formular und Tagesbudget sind Pflicht; Dateien laden im Hintergrund weiter."
          >
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <div className="flex min-w-0 flex-col gap-6">
                <VorschlagKopf state={state} setState={setState} warnings={warnings} />

                <CollapsibleGroup type="multiple" value={openSets} onChange={onOpenSetsChange} density="spacious">
                  <div className="space-y-3">
                    {issues.perSet.map(({ set, blockers }, i) => (
                      <Collapsible key={set.id} value={set.id} className="border-line bg-surface collapsible-wide-trigger rounded-2xl border px-4" trigger={/* unchanged from old step 2 */}>
                        <AdSetBlock
                          value={set}
                          pageId={client?.pageId ?? ""}
                          pageName={client?.pageName ?? ""}
                          instagramUserId={instagram?.id}
                          instagramLabel={instagramLabel}
                          adAccount={state.adAccount}
                          business={state.business}
                          roles={state.roles}
                          roleFreeText={state.roleFreeText}
                          benefits={state.benefits}
                          benefitsSource={state.sources.benefits}
                          onBenefitsChange={(benefits) => setState((s) => edited(s, "benefits", { benefits }))}
                          autoGenerate={i === 0}
                          formHint={state.formHint}
                          driveFolderId={state.driveFolderId}
                          blockers={blockers}
                          otherAdSets={state.adSets.filter((o) => o.id !== set.id).map(({ id, name, ads }) => ({ id, name, ads }))}
                          borrowersOfAd={(adId) => borrowersOf(state.adSets, set.id, adId)}
                          onChange={(patch) => updateAdSet(i, patch)}
                          onRemove={() => removeAdSet(i)}
                          canRemove={state.adSets.length > 1}
                        />
                      </Collapsible>
                    ))}
                  </div>
                </CollapsibleGroup>

                <Button variant="secondary" onClick={addLocation} label="Standort hinzufügen" icon={<Sign meaning="add" />} />

                <Divider />

                <Optional
                  state={state}
                  setState={setState}
                  accountSource={accountSource}
                  accountItem={accountItem}
                  prefill={prefill}
                  fixed={FIXED}
                />
              </div>

              {previewSet && (
                <section className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6">
                  <Text type="large" weight="medium" as="h3">Vorschau</Text>
                  {state.adSets.length > 1 && (
                    <Selector label="Standort für die Vorschau" isLabelHidden options={state.adSets.map((s) => ({ value: s.id, label: s.name }))} value={previewSet.id} onChange={setPreviewSetId} width="100%" />
                  )}
                  <Preview adSet={previewSet} pageName={client?.pageName ?? ""} pageId={client?.pageId ?? ""} adAccount={state.adAccount} />
                </section>
              )}
            </div>
          </Step>
        )}
```

The location's `addressString` from the brief lands in `set.addressString`, and `LocationField` shows it; add `<Herkunft source={state.sources.location} />` under the `LocationField` inside `AdSetBlock` by passing `locationSource={i === 0 ? state.sources.location : undefined}` — add that optional prop to `AdSetBlock` (one line in props, one `<Herkunft>` under `LocationField`).

**Step 2 JSX**: the old step-4 block, minus the `Angaben` summary. Keep the `Infotafel` with the ad-set list, the blockers banner, overlaps, progress, receipt, and the preview column. Add under `ReceiptPanel`:

```tsx
            {clickup && (
              <Banner
                status={clickup.error ? "warning" : "success"}
                title={clickup.error ? "ClickUp nicht aktualisiert" : "ClickUp-Aufgabe auf „Abnahme Kampagne“"}
                description={clickup.error ?? "Kommentar mit Name und Ads-Manager-Link steht an der Aufgabe."}
              />
            )}
```

with state and effect:

```ts
  const [clickup, setClickup] = useState<{ error?: string }>();
  // Angelegt heißt: Aufgabe weiter. Einmal je campaignId, nach forget().
  const taskId = state.taskId;
  useEffect(() => {
    if (!campaignId || !taskId) return;
    closeBriefAction(taskId, state.campaignName, state.adAccount, campaignId).then(setClickup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);
```

Order matters: read `state.taskId` into `taskId` *before* the existing `forget()` effect runs (both key on `campaignId`; `forget` does not clear `taskId` from state, so this is safe either way).

**Issues per step**: `const stepIssues = [issues.customer.length, issues.adSets.length + issues.details.length, 0];` and `allIssues` unchanged.

**Footer**: unchanged, `Weiter: ${STEPS[stepIndex + 1]}`.

Delete from wizard.tsx everything now living in `auftrag.tsx`/`vorschlag.tsx` (client/account types, `fuzzySource`, `toCalendarDate`/`toIsoDate`, `NAME_EDITED_HINT`, `FieldsetSection`, the `editingName` state, `LeadgenTosAlert`). Target: wizard.tsx ≤ 650 lines.

- [ ] **Step 5: Type-check, run all tests**

Run: `bunx tsc --noEmit -p . && bun test`
Expected: clean, all green.

- [ ] **Step 6: Run the app and walk the three screens**

Run: `bun dev` (in background) and open `http://localhost:3000/campaigns/new`. Check:

1. Screen 1 lists the ClickUp tasks; "Vorschlag erstellen" on MeVita shows a spinner, then screen 2.
2. Screen 2: name reads "MeVita Pflegedienst GmbH - PFK ab <today> <your initials> (via One)"; roles chip PFK with "aus ClickUp"; Tagesbudget 17,05 € with "aus ClickUp"; "Hinweise aus der Aufgabe" shows the description; Standort field prefilled; Drive shelf shows the folder path; texts generate with skeletons; Optional collapsed.
3. Change a role → its "aus ClickUp" badge disappears.
4. Reload the page → draft restored, texts kept, no re-generation.
5. Screen 3: blockers list; do **not** click Erstellen against a real customer unless the user asks.
6. "Ohne Aufgabe beginnen" shows the customer typeahead; picking a customer unlocks step 2 with empty fields.

Stop the dev server. Fix whatever broke; commit fixes with the task.

- [ ] **Step 7: Commit**

```bash
git add app/campaigns/new/herkunft.tsx app/campaigns/new/auftrag.tsx app/campaigns/new/vorschlag.tsx app/campaigns/new/wizard.tsx app/campaigns/new/ad-set-block.tsx
git commit -m "feat: Kampagnen-Assistent v2 – Auftrag aus ClickUp, Vorschlag mit Herkunft je Feld, Anlegen schließt die Aufgabe

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Nachlese – README, Loading-Skelett, tote Exporte

**Files:**
- Modify: `README.md` (ClickUp section)
- Modify: `app/campaigns/new/loading.tsx` (skeleton for the task list instead of the customer field)
- Modify: `app/campaigns/new/stepper.tsx` — no change needed; verify three steps render
- Check: `grep -rn "KNOWN_INITIALS\|BenefitsDialog\|benefits-dialog\|INITIALS_KEY\|knownInitials" app lib` returns nothing

- [ ] **Step 1: README**

Add under the environment section of `README.md` a paragraph in the file's voice: what `CLICKUP_API_TOKEN` is for, that the token needs write access to move tasks to `abnahme kampagne`, and that the Onboarding-Tabelle must be shared with the Drive service account (same as the folder).

- [ ] **Step 2: loading.tsx**

Replace the customer-field skeleton with three 44-px row skeletons under a heading skeleton, matching `Auftrag`'s loading state (copy the `Skeleton` block from `auftrag.tsx`).

- [ ] **Step 3: Grep for leftovers, run everything**

```bash
grep -rn "KNOWN_INITIALS\|BenefitsDialog\|benefits-dialog\|INITIALS_KEY\|knownInitials" app lib scripts; bunx tsc --noEmit -p . && bun test
```

Expected: grep empty (except `scripts/` if a script uses `KNOWN_INITIALS`; then replace it with `initialsOf` or a literal), tsc clean, tests green.

- [ ] **Step 4: Commit**

```bash
git add README.md app/campaigns/new/loading.tsx
git commit -m "docs: ClickUp-Token und Onboarding-Tabelle im README; Ladeskelett für die Aufgabenliste

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
