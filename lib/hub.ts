/**
 * OAuth-Client gegen den MedArbeiter-Hub – Authorization-Code-Flow mit opaken
 * Tokens. Bewusst von Hand: kein OIDC, kein Discovery-Dokument, keine
 * Refresh-Tokens; eine OIDC-Bibliothek würde nach /.well-known suchen und
 * scheitern. Das Access-Token lebt eine Stunde und trägt genau einen
 * userinfo-Aufruf – danach ist es weg, die eigene Sitzung ist lib/session.ts.
 */
import type { Person } from "./session";

/** Trägt state und Rücksprungziel über den Redirect zum Hub und zurück – das ist der CSRF-Schutz. */
export const STATE_COOKIE = "anmeldung";

const hub = () => (process.env.MEDARBEITER_URL ?? "").replace(/\/$/, "");
const clientId = () => process.env.MEDARBEITER_CLIENT_ID ?? "";
// Muss byte-identisch zur Registrierung im Hub sein – der Abgleich dort ist
// exakter Stringvergleich, deshalb eigene Variable statt Ableitung aus der Anfrage.
const redirectUri = () => process.env.MEDARBEITER_REDIRECT_URI ?? "";

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    state,
  });
  return `${hub()}/api/oauth/authorize?${params}`;
}

/** RFC 6749 Anhang B: client_id und Secret werden vor dem Base64 URL-codiert. */
export function basicAuth(id: string, secret: string): string {
  return "Basic " + Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64");
}

/**
 * Tauscht den Code gegen die Identität. Genau ein Versuch: eine zweite
 * Einlösung desselben Codes schlägt nicht nur fehl, sie widerruft auch das
 * Token der ersten (Replay-Schutz des Hubs). Fehlertexte tragen bewusst nur
 * den Status – nie Code, Token oder Secret, die Meldungen landen im Log.
 */
export async function redeemCode(code: string): Promise<Person> {
  const tokenRes = await fetch(`${hub()}/api/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(clientId(), process.env.MEDARBEITER_CLIENT_SECRET ?? ""),
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }),
  });
  if (!tokenRes.ok) throw new Error(`Token-Tausch mit dem Hub fehlgeschlagen (${tokenRes.status}).`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch(`${hub()}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) throw new Error(`Identität vom Hub nicht lesbar (${infoRes.status}).`);
  const { sub, name, email, role, rechte } = (await infoRes.json()) as Person;
  return { sub: String(sub), name, email, role, rechte: Array.isArray(rechte) ? rechte : [] };
}
