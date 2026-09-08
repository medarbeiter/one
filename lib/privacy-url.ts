/**
 * Die Datenschutz-URL des Kunden: von der Startseite abgelesen. Erst ein
 * Link mit „datenschutz"/„privacy", sonst „impressum", sonst die Website
 * selbst – Meta will irgendeine URL, und die Website ist besser als nichts.
 */

export function pickPrivacyLink(html: string, base: string): string {
  const hrefs = [...html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: m[1].trim(),
    text: m[2].replace(/<[^>]+>/g, " "),
  }));
  const find = (re: RegExp) => hrefs.find((a) => re.test(a.href) || re.test(a.text));
  const hit = find(/datenschutz|privacy/i) ?? find(/impressum/i);
  if (!hit) return base;
  try {
    return new URL(hit.href, base).toString();
  } catch {
    return base;
  }
}

export async function findPrivacyUrl(website: string): Promise<string> {
  const base = website.trim();
  if (!base) return "";
  try {
    const res = await fetch(base, {
      headers: { "user-agent": "Mozilla/5.0 (MedArbeiter One)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return base;
    return pickPrivacyLink(await res.text(), res.url || base);
  } catch {
    return base;
  }
}

/** „vitalcura.de" → „https://vitalcura.de/" – was in der Kundenübersicht steht, hat selten ein Schema. */
export function normalizeWebsite(input: string | undefined): string {
  const s = input?.trim().replace(/^<|>$/g, "");
  if (!s) return "";
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).toString();
  } catch {
    return "";
  }
}
