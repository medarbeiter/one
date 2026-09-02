/**
 * Google Drive, nur lesend: die UGC-Videos liegen je Kunde in einem Ordner
 * „<Kunde>/1 - Recruiting/UGC Videos“. Bisher wurden sie von Hand geladen und
 * von Hand in den Assistenten gezogen – hier holt der Server sie und reicht
 * sie dem Browser durch, der sie wie eine lokal gewählte Datei einreiht.
 *
 * Kein googleapis-Paket: ein Dienstkonto braucht genau ein signiertes JWT
 * (RS256, node:crypto) gegen ein Zugriffstoken, und die Drive-API ist REST.
 * Der Kundenordner (oder die Ablage) ist einmalig mit der E-Mail des
 * Dienstkontos geteilt – `client_email` im Schlüssel.
 */
import { createSign } from "node:crypto";

export type Key = { client_email: string; private_key: string };

function key(): Key {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY fehlt – siehe .env.example.");
  return JSON.parse(raw) as Key;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Das JWT, das Google gegen ein Zugriffstoken tauscht. Eine Stunde, nur lesen. */
export function assertion(k: Key, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(
    JSON.stringify({
      iss: k.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const sig = createSign("RSA-SHA256").update(`${header}.${claims}`).end().sign(k.private_key);
  return `${header}.${claims}.${b64(sig)}`;
}

let cached: { token: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion(key()),
    }),
  });
  const json = (await res.json()) as { access_token: string; expires_in: number; error?: string; error_description?: string };
  if (!res.ok) throw new Error(`Google: ${json.error_description ?? json.error ?? res.status}`);
  cached = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

const API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  /** Drive hat ein Vorschaubild gerendert – abrufbar über thumbnail(). */
  hasThumbnail?: boolean;
};

async function api(path: string, params: Record<string, string>): Promise<Response> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Geteilte Ablagen und „Meine Ablage“ gleichermaßen – ohne das sieht Drive
  // nur, was dem Dienstkonto selbst gehört, also nichts.
  url.searchParams.set("supportsAllDrives", "true");
  const res = await fetch(url, { headers: { authorization: `Bearer ${await token()}` } });
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function list(q: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = (await (
      await api("files", {
        q: `${q} and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,size,hasThumbnail)",
        pageSize: "200",
        includeItemsFromAllDrives: "true",
        orderBy: "name",
        ...(pageToken && { pageToken }),
      })
    ).json()) as { files: DriveFile[]; nextPageToken?: string };
    out.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/**
 * Kundenordner zum Namen. Drives `contains` vergleicht Wortanfänge, deshalb
 * greift „Hammonia“ auch bei „Pflegedienst Hammonia“ – „Pflegedienst Hammonia
 * GmbH“ aber nicht bei „Hammonia“. Findet der volle Name nichts, versucht es
 * das längste Wort; der Dialog zeigt die Treffer und lässt nachbessern.
 */
export async function findFolders(name: string): Promise<DriveFile[]> {
  const byName = (n: string) => list(`mimeType = '${FOLDER}' and name contains ${quote(n)}`);
  for (const candidate of searchTerms(name)) {
    const found = await byName(candidate);
    if (found.length) return found;
  }
  return [];
}

/** Voller Name, dann ohne Rechtsform, dann das längste Wort (das kein Gattungswort ist). */
export function searchTerms(name: string): string[] {
  const full = name.trim().replace(/\s+/g, " ");
  const bare = full.replace(LEGAL_FORM, " ").replace(/\s+/g, " ").trim();
  const longest = bare
    .split(" ")
    .filter((w) => w.length >= 4 && !GENERIC.test(w))
    .sort((a, b) => b.length - a.length)[0];
  return [...new Set([full, bare, longest].filter((s): s is string => Boolean(s)))];
}

const LEGAL_FORM = /(\b(gmbh|ug|kg|ag|ohg|gbr|mbh)\b\.?|e\.\s?v\.|&\s?co\.?)/gi;
const GENERIC = /^(pflege\w*|ambulante[rs]?|seniorenheim|altenheim|haus|betreuung\w*|dienst\w*|sozialstation|krankenpflege|senioren\w*|wohn\w*|zentrum|mobile[rs]?|häusliche[rs]?)$/i;

export const children = (parent: string) => list(`'${parent}' in parents`);

export const isFolder = (f: DriveFile) => f.mimeType === FOLDER;
export const isMedia = (f: DriveFile) =>
  f.mimeType.startsWith("video/") || f.mimeType === "image/jpeg" || f.mimeType === "image/png";

/** Ein Ordnerinhalt, wie der Dialog ihn zeigt: Unterordner zum Hineingehen, Medien zum Abhaken. */
export const entriesOf = async (folderId: string, kids = children): Promise<DriveFile[]> =>
  (await kids(folderId)).filter((f) => isFolder(f) || isMedia(f));

export type Landing = { path: DriveFile[]; entries: DriveFile[] };

/**
 * Der beste Tipp, wo die Videos liegen – der Dialog lässt von dort aus jeden
 * Schritt korrigieren. Erst „1 - Recruiting“ (bei älteren Kunden
 * „1 - Mitarbeitergewinnung“); dort liegen meist nur Beispielvideos, das
 * Eigentliche steckt in „Werbemotive“ – oder, wo es die nicht gibt, in „UGC
 * Videos“. Dann weiter hinein, solange hier keine Medien liegen, aber ein
 * Unterordner offensichtlich der richtige ist: einer, der nach UGC oder Video
 * heißt, oder schlicht der einzige. Bei mehreren gleichwertigen bleibt es
 * stehen – raten wäre hier nur falsch.
 */
export async function landing(customer: DriveFile, kids = children): Promise<Landing> {
  const path = [customer];
  let entries = await entriesOf(customer.id, kids);
  const descend = async (next: DriveFile) => {
    path.push(next);
    entries = await entriesOf(next.id, kids);
  };

  // Je Stufe der erste Ausdruck, der einen nicht leeren Ordner findet; findet
  // keiner, ist Schluss. Ein leeres „Werbemotive“ (angelegt, nie befüllt) soll
  // nicht vor einem vollen „UGC Videos“ daneben gewinnen.
  const steps = [[/^1\s*-|recruiting|mitarbeitergewinnung/i], [/werbemotiv/i, /ugc/i]];
  for (const patterns of steps) {
    const folders = entries.filter(isFolder);
    const candidates = patterns.map((p) => folders.find((f) => p.test(f.name))).filter((f): f is DriveFile => Boolean(f));
    if (!candidates.length) break;
    let chosen = candidates[0];
    let inside = await entriesOf(chosen.id, kids);
    for (const other of candidates.slice(1)) {
      if (inside.length) break;
      const alt = await entriesOf(other.id, kids);
      if (alt.length) [chosen, inside] = [other, alt];
    }
    path.push(chosen);
    entries = inside;
  }
  // ponytail: höchstens fünf Stufen tiefer – gegen Endlosverschachtelung, nicht gegen echte Ordner.
  for (let depth = 0; depth < 5 && !entries.some(isMedia); depth++) {
    const folders = entries.filter(isFolder);
    const next = folders.find((f) => /ugc|video/i.test(f.name)) ?? (folders.length === 1 ? folders[0] : undefined);
    if (!next) break;
    await descend(next);
  }
  return { path, entries };
}

/**
 * Welcher Treffer der Kundenordner ist, sagt sein Inhalt, nicht sein Name:
 * „Hammonia“ findet auch „Ergebnisse Hammonia“ tief im Content-Marketing, und
 * alphabetisch steht das vorn. Der Kundenordner ist der, in dem der Weg am
 * weitesten hineinführt – „1 - Recruiting“ hat nur er. Gleichstand: der erste.
 * Höchstens fünf werden geöffnet; der Dialog zeigt alle zum Anklicken.
 */
export async function bestLanding(
  folders: DriveFile[],
  kids = children,
): Promise<{ folders: DriveFile[]; landed: Landing | null }> {
  if (!folders.length) return { folders, landed: null };
  const tried = await Promise.all(folders.slice(0, 5).map((f) => landing(f, kids)));
  const best = tried.reduce((a, b) => (b.path.length > a.path.length ? b : a));
  const winner = best.path[0];
  return { folders: [winner, ...folders.filter((f) => f.id !== winner.id)], landed: best };
}

/**
 * Das Vorschaubild, das Drive selbst gerendert hat – auch für Videos. Der Link
 * ist kurzlebig und braucht das Token, deshalb erst die Metadaten, dann das
 * Bild, beides serverseitig. `=s400` statt der voreingestellten 220 Pixel.
 */
export async function thumbnail(id: string): Promise<Response | null> {
  const { thumbnailLink } = (await (
    await api(`files/${encodeURIComponent(id)}`, { fields: "thumbnailLink" })
  ).json()) as { thumbnailLink?: string };
  if (!thumbnailLink) return null;
  const res = await fetch(thumbnailLink.replace(/=s\d+$/, "=s400"), {
    headers: { authorization: `Bearer ${await token()}` },
  });
  return res.ok ? res : null;
}

/** Die Datei selbst, als Strom – der Route Handler reicht sie unverändert weiter. */
export const download = (id: string) => api(`files/${encodeURIComponent(id)}`, { alt: "media" });
