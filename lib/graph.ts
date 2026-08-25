/**
 * Alles gegen die Graph API läuft durch `graph()`. Kein SDK, kein OAuth-Flow:
 * ein System-User-Token aus dem Business Manager reicht (siehe README).
 */

const API = `https://graph.facebook.com/${process.env.META_API_VERSION ?? "v26.0"}`;

// Aus dem Ads Manager kopierte IDs kommen ohne "act_" – Graph braucht es aber.
export const actId = (id: string) =>
  !id || id.startsWith("act_") ? id : `act_${id}`;

export const meta = {
  business: process.env.META_BUSINESS_ID ?? "",
  adAccount: actId(process.env.META_AD_ACCOUNT_ID ?? ""),
};

export type GraphFailure = {
  kind: "token" | "permission" | "rate" | "unknown";
  message: string;
  retryable: boolean;
  /** Metas Fehlercode, sofern er einen trug. Für Aufrufer, denen `kind` zu grob
   *  ist – etwa die Identitätsprüfung in launch-request.ts, die eine fehlende
   *  Zuweisung anders erklären muss als LESS_PERSONALIZED_ADS. */
  code?: number;
};

export class GraphError extends Error {
  kind: GraphFailure["kind"];
  retryable: boolean;
  code?: number;
  constructor(f: GraphFailure) {
    super(f.message);
    this.name = "GraphError";
    this.kind = f.kind;
    this.retryable = f.retryable;
    this.code = f.code;
  }
}

function token() {
  const t = process.env.META_ACCESS_TOKEN;
  // GraphError statt Error: die Anzeige unterscheidet tot von teilweise
  // kaputt allein am kind-Feld.
  if (!t)
    throw new GraphError({
      kind: "token",
      message: "META_ACCESS_TOKEN missing – see README.md",
      retryable: false,
    });
  return t;
}

/**
 * Metas Nutzungsbedingungen für Lead-Anzeigen, nicht von der Seite angenommen.
 * Steht nicht im code, sondern im Subcode: der code ist 100 ("Invalid
 * parameter") und sagt für sich genommen nichts.
 *
 * Hier aufgeführt, weil dieser Fehler das Gegenteil von behebbar ist – kein
 * Retry hilft, solange kein Administrator der Seite sie annimmt, und über die
 * API annehmen lassen sie sich nicht (siehe leadgenTosUrl in customers.ts).
 * resolveLaunch() fängt den Fall vorher ab; hierher kommt nur, wessen Seite dem
 * System User nicht zugewiesen ist – deren Status dürfen wir gar nicht lesen.
 *
 * 1892291 ist die Partnerschafts-Variante: dort fehlt die Zustimmung nicht auf
 * unserer, sondern auf der beworbenen Seite.
 */
const LEADGEN_TOS_SUBCODES = [1815089, 1892181, 1892291];

/**
 * „Weil <Name> sich für less-personalized Werbung entschieden hat, kannst du
 * keine Anzeigen erstellen." Metas EU-Wahl gegen personalisierte Werbung – wer
 * sie trifft, kann selbst keine Anzeigen mehr schalten. Gemeint ist nicht das
 * Werbekonto, sondern die Identität, unter der die Anzeige läuft: das
 * Instagram-Konto oder das Profil hinter der Seite. Der Name in der Meldung sagt,
 * welche.
 *
 * Wie die Lead-Bedingungen: nur in Metas eigener Oberfläche zu ändern, von der
 * betroffenen Identität selbst, nicht vom Werbekonto aus – und damit das Gegenteil
 * von wiederholbar. Anders als bei den Lead-Bedingungen gibt Graph den Zustand
 * aber nirgends zu lesen; deshalb steht in launch-request.ts eine Probe davor.
 */
export const LESS_PERSONALIZED_ADS = 3858412;

// 190 = Token tot, 4/17/32/613 = Rate-Limit, 10/200/272 = fehlende Berechtigung.
// Die Einordnung entscheidet, was der Mensch zu sehen bekommt – nicht der Text.
export function mapGraphError(err: any, status = 0): GraphFailure {
  const code = err?.code ?? 0;
  const message = err?.error_user_msg || err?.message || `Graph ${status || "request failed"}`;
  // Ein fehlender Code bleibt weg statt als 0 dazustehen – 0 wäre ein Code, den
  // Meta nie vergibt, und ein Aufrufer müsste ihn eigens ausschließen.
  const base = code ? { message, code } : { message };
  if (code === 190) return { ...base, kind: "token", retryable: false };
  if ([4, 17, 32, 613].includes(code)) return { ...base, kind: "rate", retryable: true };
  if ([10, 200, 272, 294].includes(code))
    return { ...base, kind: "permission", retryable: false };
  // Vor dem unknown-Zweig: der trüge diesen Fehler bei einer 500er-Antwort als
  // retryable weiter, und ein Retry legte dieselben Anzeigen ein zweites Mal an,
  // ohne dass die zweite Runde besser ausgehen könnte als die erste.
  if (LEADGEN_TOS_SUBCODES.includes(err?.error_subcode ?? 0))
    return { ...base, kind: "permission", retryable: false };
  // Aus demselben Grund vor is_transient: welches der beiden Felder Meta für
  // 3858412 benutzt, ist nicht dokumentiert, also werden beide gelesen – und die
  // Meldung kam in freier Wildbahn als „unknown error" durch, also womöglich
  // sogar mit is_transient. Wiederholen ändert an einer Werbepräferenz nichts.
  if (code === LESS_PERSONALIZED_ADS || err?.error_subcode === LESS_PERSONALIZED_ADS)
    return { ...base, kind: "permission", retryable: false, code: LESS_PERSONALIZED_ADS };
  // „Deine Anfrage ist abgelaufen, da du zu viele Unterhaltungen mit Nutzern
  // hast, die keine Rolle in der App haben." Die App hat für
  // instagram_manage_messages nur Standard-Zugriff; Meta siebt die Liste dann
  // auf Nutzer mit App-Rolle herunter, geht dafür jeden Thread durch und läuft
  // bei betriebsamen Konten in die Zeitgrenze. Kommt mit is_transient, ist es
  // aber nicht: der zweite Versuch läuft in dieselbe Grenze. Aufgehoben wird
  // das einmalig durch Advanced Access im App-Review, nicht pro Kunde.
  //
  // Auf den Berechtigungsnamen statt auf einen Code: welchen Meta hier
  // schickt, ist nirgends zugesagt – der Name steht auch in der deutschen
  // Fassung der Meldung wörtlich drin.
  if (message.includes("instagram_manage_messages"))
    return { ...base, kind: "permission", retryable: false };
  // is_transient setzt Meta selbst, wenn nur der Zeitpunkt schuld war: "Etwas
  // ist schiefgelaufen. Bitte versuche es später noch einmal." kommt mit 400
  // und fiele sonst als endgültig in die Quittung – obwohl derselbe Aufruf ein
  // paar Sekunden später durchgeht. Genau das war die Handarbeit dahinter: erst
  // der Knopf „Erneut versuchen“ hat die Anzeige angelegt.
  //
  // Auf Metas Flag statt auf einen Code: welcher Code darunter steckt, wechselt
  // (1, 2, 1487390 …), die Aussage nicht. Ein Fehler-Body heißt außerdem, dass
  // nichts angelegt wurde – dieselbe Annahme, auf der batchAds() in launch.ts
  // schon seinen Rückfall aufbaut –, also legt der zweite Versuch nichts doppelt an.
  if (err?.is_transient === true) return { ...base, kind: "unknown", retryable: true };
  return { ...base, kind: "unknown", retryable: status >= 500 };
}

/**
 * Ein paar Seiten-Edges (leadgen_forms, Beiträge, Konversationen) lehnen den
 * System-User-Token ab: "(#190) This method must be called with a Page Access
 * Token". Getauscht wird mit ebendiesem Token; das Ergebnis hält so lange wie
 * er. Deshalb nur im Prozess gemerkt – Tokens gehören nicht in den Datei-Cache.
 */
const pageTokens = new Map<string, Promise<string>>();

export function pageToken(pageId: string): Promise<string> {
  let pending = pageTokens.get(pageId);
  if (pending) return pending;

  pending = graph<{ access_token?: string }>(pageId, { params: { fields: "access_token" } })
    .then(({ access_token }) => {
      // 200 ohne Token heißt: System-User hat die Seite nicht zugewiesen.
      if (!access_token)
        throw new GraphError({
          kind: "permission",
          message: `No page access token for page ${pageId} – assign the system user to this page in the Business Manager (task: MANAGE or LEADS).`,
          retryable: false,
        });
      return access_token;
    })
    .catch((err) => {
      pageTokens.delete(pageId); // sonst brennt ein einmaliger Fehlschlag ein
      throw err;
    });

  pageTokens.set(pageId, pending);
  return pending;
}

export type GraphOpts = {
  method?: "GET" | "POST" | "DELETE";
  params?: Record<string, unknown>;
  body?: FormData;
  /** Seiten-ID: fragt mit deren Seiten-Token statt dem System-Token. */
  asPage?: string;
  /** Sekunden. Ohne diesen Wert wird nicht gecacht (richtig für Mutationen). */
  revalidate?: number;
  tags?: string[];
};

/**
 * Graphs Regel für Parameter: alles ist ein String, Objekte sind JSON. An einer
 * Stelle, damit ein Creative im Batch dieselbe Kodierung erfährt wie einzeln –
 * zwei Fassungen davon würden erst bei Meta auseinanderlaufen.
 */
export function encodeParams(params: Record<string, unknown>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    out.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return out;
}

export async function graph<T = any>(path: string, opts: GraphOpts = {}): Promise<T> {
  const { method = "GET", params = {}, body, asPage, revalidate, tags } = opts;
  const url = new URL(`${API}/${path}`);
  url.searchParams.set("access_token", asPage ? await pageToken(asPage) : token());
  for (const [k, v] of encodeParams(params)) url.searchParams.set(k, v);

  const init: RequestInit =
    revalidate === undefined
      ? { method, body, cache: "no-store" }
      : { method, body, next: { revalidate, tags } };

  // ponytail: drei Versuche, fester Backoff. Auf einen Token-Bucket erst
  // umbauen, wenn Rate-Limits im Normalbetrieb auftreten statt in Spitzen.
  //
  // Rate-Limits ausgenommen: Metas Stundenbudget erholt sich nicht in den
  // Sekunden eines Backoffs, der Retry verdreifachte nur den Verkehr genau
  // dann, wenn das Budget schon leer ist. retryable bleibt am Fehler dran –
  // ein Aufrufer mit echtem, langem Backoff darf anders entscheiden.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const json = await res.json();
    if (res.ok) return json as T;
    const failure = mapGraphError(json?.error, res.status);
    if (!failure.retryable || failure.kind === "rate" || attempt >= 2)
      throw new GraphError(failure);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

export type BatchRequest = {
  method?: "GET" | "POST";
  relative_url: string;
  /** POST-Nutzlast; wie `params` bei graph(), nur als Query-String im Sub-Request. */
  body?: Record<string, unknown>;
  /** Macht das Ergebnis referenzierbar: "{result=<name>:$.id}". */
  name?: string;
  depends_on?: string;
};

type BatchItem = { code: number; body: string } | null;

// Sub-Requests scheitern einzeln – deshalb PromiseSettledResult statt Werfen.
export function unwrapBatchItem<T>(item: BatchItem): PromiseSettledResult<T> {
  if (!item)
    return {
      status: "rejected",
      reason: new GraphError({ kind: "unknown", message: "Batch sub-request timed out", retryable: true }),
    };
  let body: any;
  try {
    body = JSON.parse(item.body);
  } catch {
    body = undefined;
  }
  if (item.code >= 200 && item.code < 300) return { status: "fulfilled", value: body as T };
  return { status: "rejected", reason: new GraphError(mapGraphError(body?.error, item.code)) };
}

/**
 * Graph erlaubt 50 Sub-Requests pro POST; alles darüber wird gestückelt.
 * `relative_url` ohne Version – die steckt schon in der Ziel-URL.
 * ponytail: Blöcke laufen nacheinander. Parallel erst, wenn >150 Requests
 * pro Seitenaufruf zusammenkommen; vorher provoziert es nur Rate-Limits.
 */
export async function batch<T = any>(
  reqs: BatchRequest[],
  opts: { revalidate?: number; tags?: string[]; asPage?: string } = {},
): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < reqs.length; i += 50) {
    const chunk = reqs.slice(i, i + 50);
    const items = await graph<BatchItem[]>("", {
      method: "POST",
      params: {
        batch: chunk.map((r) => ({
          method: r.method ?? "GET",
          relative_url: r.relative_url,
          ...(r.body ? { body: encodeParams(r.body).toString() } : {}),
          // Ein benannter Sub-Request liefert im Erfolgsfall standardmäßig gar
          // nichts zurück – und fehlt dann im Ergebnis-Array, statt als Lücke
          // darin zu stehen.
          ...(r.name ? { name: r.name, omit_response_on_success: false } : {}),
          ...(r.depends_on ? { depends_on: r.depends_on } : {}),
        })),
        include_headers: false,
      },
      ...opts,
    });
    out.push(...items.map((item) => unwrapBatchItem<T>(item)));
  }
  return out;
}
