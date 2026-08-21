/**
 * Die letzte Stufe der Bildersuche und die einzige, die nicht über die
 * Graph-API läuft: dieselbe interne Route, die instagram.com im Browser
 * benutzt. Sie gibt ein Profilbild auch für private und persönliche Konten
 * her – also genau dort, wo business_discovery nichts liefert.
 *
 * Was das kostet, ehrlich benannt:
 * - Sie steht nicht in Metas API-Bedingungen. Das Pfand ist derselbe Business
 *   Manager, an dem alle Kundenseiten und das Werbekonto hängen.
 * - Aus einem Rechenzentrum (Coolify) antwortet sie ohne angemeldete Cookies
 *   nach wenigen Aufrufen mit 401 oder 429.
 * Deshalb: standardmäßig aus. IG_SCRAPE_AVATARS=1 schaltet sie ein,
 * IG_SCRAPE_COOKIE und IG_SCRAPE_PROXY halten sie am Leben, und der erste
 * harte Korb schaltet sie für diesen Prozess wieder ab.
 *
 * ponytail: fest verdrahtetes Stundenfenster statt Token-Bucket. Erst
 * ausbauen, wenn die 25 Bilder/Stunde tatsächlich der Engpass sind.
 */

/** Die App-Id, mit der sich instagram.com im Browser selbst ausweist. */
const WEB_APP_ID = "936619743392459";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FENSTER = 60 * 60 * 1000;

let gesperrt: string | undefined;
let fensterStart = 0;
let imFenster = 0;

const grenze = () => Number(process.env.IG_SCRAPE_MAX ?? 25);

/** Ob es sich überhaupt lohnt zu fragen – spart dem Aufrufer die Schleife. */
export function scrapeMoeglich(): boolean {
  if (process.env.IG_SCRAPE_AVATARS !== "1" || gesperrt) return false;
  if (Date.now() - fensterStart > FENSTER) return true;
  return imFenster < grenze();
}

/** Warum es gerade nicht geht – für den Bericht, nicht für die Logik. */
export const scrapeGesperrt = () => gesperrt;

export async function scrapeIgAvatar(username: string): Promise<string | undefined> {
  if (!scrapeMoeglich()) return undefined;
  const jetzt = Date.now();
  if (jetzt - fensterStart > FENSTER) {
    fensterStart = jetzt;
    imFenster = 0;
  }
  imFenster++;

  const cookie = process.env.IG_SCRAPE_COOKIE;
  const proxy = process.env.IG_SCRAPE_PROXY;
  try {
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          "x-ig-app-id": WEB_APP_ID,
          "user-agent": UA,
          accept: "*/*",
          ...(cookie ? { cookie } : {}),
        },
        // Bun kennt proxy in fetch(); im DOM-Typ steht es nicht.
        ...(proxy ? ({ proxy } as object) : {}),
      },
    );
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      // Kein Nachfassen: das ist die Absage an unsere Adresse, nicht an diesen
      // Benutzernamen. Ein Neustart – oder ein Cookie – probiert von vorn.
      gesperrt = `Instagram hat den Direktweg mit ${res.status} abgewiesen (IG_SCRAPE_COOKIE/IG_SCRAPE_PROXY setzen oder IG_SCRAPE_AVATARS=0).`;
      return undefined;
    }
    if (!res.ok) return undefined; // 404: Konto gelöscht oder umbenannt.
    const json = (await res.json()) as {
      data?: { user?: { profile_pic_url_hd?: string; profile_pic_url?: string } };
    };
    const user = json.data?.user;
    return user?.profile_pic_url_hd ?? user?.profile_pic_url;
  } catch (e) {
    gesperrt = `Instagram-Direktweg nicht erreichbar: ${(e as Error).message}`;
    return undefined;
  }
}

/** Nur für Tests: der Prozesszustand ist sonst absichtlich klebrig. */
export function resetScrapeState(): void {
  gesperrt = undefined;
  fensterStart = 0;
  imFenster = 0;
}
