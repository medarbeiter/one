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

function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN missing – see README.md");
  return t;
}

export type GraphFailure = {
  kind: "token" | "permission" | "rate" | "unknown";
  message: string;
  retryable: boolean;
};

export class GraphError extends Error {
  kind: GraphFailure["kind"];
  retryable: boolean;
  constructor(f: GraphFailure) {
    super(f.message);
    this.name = "GraphError";
    this.kind = f.kind;
    this.retryable = f.retryable;
  }
}

// 190 = Token tot, 4/17/32/613 = Rate-Limit, 10/200/272 = fehlende Berechtigung.
// Die Einordnung entscheidet, was der Mensch zu sehen bekommt – nicht der Text.
export function mapGraphError(err: any, status = 0): GraphFailure {
  const code = err?.code ?? 0;
  const message = err?.error_user_msg || err?.message || `Graph ${status || "request failed"}`;
  if (code === 190) return { kind: "token", message, retryable: false };
  if ([4, 17, 32, 613].includes(code)) return { kind: "rate", message, retryable: true };
  if ([10, 200, 272, 294].includes(code))
    return { kind: "permission", message, retryable: false };
  return { kind: "unknown", message, retryable: status >= 500 };
}

export type GraphOpts = {
  method?: "GET" | "POST" | "DELETE";
  params?: Record<string, unknown>;
  body?: FormData;
  /** Sekunden. Ohne diesen Wert wird nicht gecacht (richtig für Mutationen). */
  revalidate?: number;
  tags?: string[];
};

export async function graph<T = any>(path: string, opts: GraphOpts = {}): Promise<T> {
  const { method = "GET", params = {}, body, revalidate, tags } = opts;
  const url = new URL(`${API}/${path}`);
  url.searchParams.set("access_token", token());
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }

  const init: RequestInit =
    revalidate === undefined
      ? { method, body, cache: "no-store" }
      : { method, body, next: { revalidate, tags } };

  // ponytail: drei Versuche, fester Backoff. Auf einen Token-Bucket erst
  // umbauen, wenn Rate-Limits im Normalbetrieb auftreten statt in Spitzen.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const json = await res.json();
    if (res.ok) return json as T;
    const failure = mapGraphError(json?.error, res.status);
    if (!failure.retryable || attempt >= 2) throw new GraphError(failure);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

export type BatchRequest = { method?: "GET" | "POST"; relative_url: string };

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
  opts: { revalidate?: number; tags?: string[] } = {},
): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < reqs.length; i += 50) {
    const chunk = reqs.slice(i, i + 50);
    const items = await graph<BatchItem[]>("", {
      method: "POST",
      params: {
        batch: chunk.map((r) => ({ method: r.method ?? "GET", relative_url: r.relative_url })),
        include_headers: false,
      },
      ...opts,
    });
    out.push(...items.map((item) => unwrapBatchItem<T>(item)));
  }
  return out;
}
