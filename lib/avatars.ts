/**
 * Woher ein Profilbild kommt, hängt bei Meta am Kanal und daran, was die App
 * freigeschaltet hat. Diese Datei kennt alle Wege und probiert sie in der
 * Reihenfolge "billig und erlaubt zuerst":
 *
 *   Instagram:  business_discovery  →  User-Profile-Route  →  Direktweg
 *   Messenger:  User-Profile-Route
 *
 * Die User-Profile-Route (`/{id}?fields=profile_pic`) ist der eigentlich
 * richtige Weg für alle: sie kennt auch private Konten. Heute weist Meta sie ab
 * – bei Instagram als (#200), bei Messenger als (#100) "does not exist, cannot
 * be loaded due to missing permissions". Beides heißt dasselbe: es fehlt
 * Advanced Access (instagram_manage_messages für IG, Business Asset User
 * Profile Access für Messenger). Der Code bleibt trotzdem
 * stehen und probiert sie einmal je Prozess: geht das App Review durch, füllt
 * sich der Posteingang beim nächsten Deploy von allein, ohne dass jemand hier
 * etwas ändert.
 *
 * ponytail: ein Verzeichnis im Prozess, sechs Stunden gültig. Metas
 * Bildadressen sind signiert und laufen nach Tagen ab; ein längerer Cache
 * zeigte tote Bilder, ein kürzerer kostet nur Anfragen.
 */
import { batch, GraphError } from "./graph";
import { scrapeIgAvatar, scrapeMoeglich } from "./ig-scrape";

const TTL = 6 * 60 * 60 * 1000;

type Eintrag = { url?: string; at: number };
const verzeichnis = new Map<string, Eintrag>();

const frisch = (schluessel: string, jetzt = Date.now()): Eintrag | undefined => {
  const e = verzeichnis.get(schluessel);
  return e && jetzt - e.at < TTL ? e : undefined;
};
const merken = (schluessel: string, url?: string) => verzeichnis.set(schluessel, { url, at: Date.now() });

/**
 * Eine Route, die dauerhaft zu sein kann. Dieselbe Überlegung wie bei
 * closedEdges in inbox-ingest.ts: eine fehlende Freigabe ändert sich nicht
 * zwischen zwei Anfragen, also einmal fragen und für den Prozess ruhen lassen.
 */
const gesperrt = new Set<string>();

type Person = { id?: string; username?: string };

/** Der Schlüssel im Verzeichnis: der Benutzername, sonst die Id. */
const schluesselVon = (p: Person) => p.username ?? p.id ?? "";

async function profilRoute(
  route: "ig" | "dm",
  pageId: string,
  ids: string[],
  treffer: Map<string, string>,
  schluessel: (id: string) => string,
  failures: string[],
): Promise<void> {
  if (ids.length === 0 || gesperrt.has(route)) return;
  try {
    const settled = await batch<{ profile_pic?: string }>(
      ids.map((id) => ({ relative_url: `${id}?fields=profile_pic` })),
      { asPage: pageId },
    );
    let gefunden = 0;
    let ersterFehler: string | undefined;
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        if (r.value?.profile_pic) {
          treffer.set(schluessel(ids[i]), r.value.profile_pic);
          gefunden++;
        }
        return;
      }
      ersterFehler ??= (r.reason as GraphError).message;
    });
    // Kein einziger Treffer heißt: nicht dieser Mensch fehlt, sondern die
    // Freigabe. Meta sagt das je nach Kanal als (#200) oder als "does not
    // exist, cannot be loaded due to missing permissions" (#100) – auf die
    // Ausbeute zu schauen ist verlässlicher als auf den Code.
    // ponytail: bei genau einer Anfrage kann das auch ein gelöschtes Konto
    // sein. Kostet einen Neustart, spart 50 Absagen pro Abgleich.
    if (gefunden === 0) {
      gesperrt.add(route);
      failures.push(`Profilbilder (${route}): ${ersterFehler ?? "keine Freigabe"}`);
    }
  } catch (e) {
    gesperrt.add(route);
    failures.push(`Profilbilder (${route}): ${(e as Error).message}`);
  }
}

/**
 * Profilbilder zu Instagram-Kommentierenden. Gibt nur zurück, was gefunden
 * wurde – wer fehlt, behält seine Initialen.
 */
export async function igAvatars(
  ctx: { pageId: string; igUserId: string },
  personen: Person[],
  failures: string[],
): Promise<Map<string, string>> {
  const treffer = new Map<string, string>();
  const offen = new Map<string, Person>();
  for (const p of personen) {
    const k = schluesselVon(p);
    if (!k) continue;
    const bekannt = frisch(k);
    if (bekannt) {
      if (bekannt.url) treffer.set(k, bekannt.url);
      continue;
    }
    offen.set(k, p);
  }
  if (offen.size === 0) return treffer;

  // 1. business_discovery: der erlaubte Weg, aber nur für Unternehmens- und
  //    Creator-Konten. Der Benutzername ist das Argument – daher eine Anfrage
  //    je Person, 50 davon in einem Batch-POST.
  const mitNamen = [...offen.values()].filter((p) => p.username);
  if (mitNamen.length > 0 && !gesperrt.has("bd")) {
    try {
      const settled = await batch<{ business_discovery?: { profile_picture_url?: string } }>(
        mitNamen.map((p) => ({
          relative_url: `${ctx.igUserId}?fields=business_discovery.username(${encodeURIComponent(p.username!)}){profile_picture_url}`,
        })),
        { asPage: ctx.pageId },
      );
      settled.forEach((r, i) => {
        const url = r.status === "fulfilled" ? r.value?.business_discovery?.profile_picture_url : undefined;
        if (url) treffer.set(mitNamen[i].username!, url);
      });
    } catch (e) {
      gesperrt.add("bd");
      failures.push(`Profilbilder (business_discovery): ${(e as Error).message}`);
    }
  }

  // 2. Die User-Profile-Route für alle, die übrig sind – erreicht auch private
  //    Konten, sobald instagram_manage_messages Advanced Access hat.
  const restIds = [...offen.entries()].filter(([k, p]) => !treffer.has(k) && p.id);
  const idZuSchluessel = new Map(restIds.map(([k, p]) => [p.id!, k]));
  await profilRoute("ig", ctx.pageId, [...idZuSchluessel.keys()], treffer, (id) => idZuSchluessel.get(id)!, failures);

  // 3. Der Direktweg, falls eingeschaltet: nacheinander, damit die Grenze in
  //    ig-scrape.ts greift, bevor Instagram sie selbst zieht.
  for (const [k, p] of offen) {
    if (treffer.has(k) || !p.username || !scrapeMoeglich()) continue;
    const url = await scrapeIgAvatar(p.username);
    if (url) treffer.set(k, url);
  }

  for (const k of offen.keys()) merken(k, treffer.get(k));
  return treffer;
}

/**
 * Profilbilder zu Messenger- und IG-DM-Gegenübern. Nur die User-Profile-Route:
 * eine PSID ist außerhalb der eigenen App nichts, das man anderswo nachschlagen
 * könnte – auch der Direktweg kennt sie nicht.
 */
export async function dmAvatars(
  pageId: string,
  ids: string[],
  failures: string[],
): Promise<Map<string, string>> {
  const treffer = new Map<string, string>();
  const offen: string[] = [];
  for (const id of new Set(ids)) {
    if (!id) continue;
    const bekannt = frisch(id);
    if (bekannt) {
      if (bekannt.url) treffer.set(id, bekannt.url);
      continue;
    }
    offen.push(id);
  }
  await profilRoute("dm", pageId, offen, treffer, (id) => id, failures);
  for (const id of offen) merken(id, treffer.get(id));
  return treffer;
}

/** Nur für Tests: Verzeichnis und Sperren sind sonst absichtlich klebrig. */
export function resetAvatarState(): void {
  verzeichnis.clear();
  gesperrt.clear();
}
