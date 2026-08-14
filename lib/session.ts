/**
 * Die eigene Sitzung nach dem Anmelden über den MedArbeiter-Hub.
 *
 * Der Hub gibt uns beim Login einmalig die Identität (lib/hub.ts); ab dann
 * trägt ein signierter Cookie sie durch jede Anfrage. Kein Server-Zustand,
 * keine Nutzertabelle – wer den Cookie fälschen will, braucht das Secret.
 */

export const SESSION_COOKIE = "sitzung";

// Ein Arbeitstag. Länger darf die Sitzung nicht leben, weil ein im Hub
// deaktiviertes Konto hier sonst weiterarbeitet – der Hub kann bereits
// ausgegebene Sitzungen nicht zurückrufen. Ablauf ist billig: solange der
// Hub-Cookie lebt, kostet die Neuanmeldung einen Klick auf der Freigabeseite.
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Die Identität, wie /api/oauth/userinfo sie liefert. `sub` ist der Schlüssel – E-Mails können sich ändern, `sub` nicht. */
export type Person = {
  sub: string;
  name: string;
  email: string;
  role: string;
  /** Maßgeblich für Berechtigungen – nie aus `role` ableiten, Konten können Zusatzrechte tragen. */
  rechte: string[];
};

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET fehlt – siehe .env.example.");
  return s;
}

const encoder = new TextEncoder();

function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Verpackt die Identität samt Ablauf in einen signierten Cookie-Wert. */
export async function sealSession(person: Person, secret: string, now = Date.now()): Promise<string> {
  const body = Buffer.from(JSON.stringify({ ...person, exp: now + SESSION_TTL_MS })).toString(
    "base64url",
  );
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${Buffer.from(sig).toString("base64url")}`;
}

/** Liest den Cookie-Wert zurück. `null` heißt: neu anmelden – egal ob gefälscht, abgelaufen oder Müll. */
export async function openSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<Person | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  // subtle.verify statt eines eigenen Vergleichs: der läuft in konstanter Zeit.
  const echt = await crypto.subtle
    .verify("HMAC", await hmacKey(secret), Buffer.from(sig, "base64url"), encoder.encode(body))
    .catch(() => false);
  if (!echt) return null;
  try {
    const { exp, sub, name, email, role, rechte } = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    );
    if (typeof exp !== "number" || exp <= now) return null;
    return { sub: String(sub), name, email, role, rechte: Array.isArray(rechte) ? rechte : [] };
  } catch {
    return null;
  }
}
