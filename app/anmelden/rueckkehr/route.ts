/**
 * Rückkehr vom MedArbeiter-Hub: state prüfen, Code einlösen, eigene Sitzung
 * setzen. Der state-Cookie wird in jedem Ausgang gelöscht – ein Neuladen der
 * Rückkehr-URL findet dadurch keinen state mehr und landet auf der
 * Fehlerseite, statt denselben Code ein zweites Mal einzulösen (das würde
 * auch das Token der ersten Einlösung widerrufen).
 */
import { NextResponse, type NextRequest } from "next/server";
import { redeemCode, STATE_COOKIE } from "@/lib/hub";
import { sealSession, SESSION_COOKIE, SESSION_TTL_MS, sessionSecret } from "@/lib/session";

// Bewusst nacktes HTML statt einer page.tsx: das Root-Layout lädt das ganze
// Kundenportfolio, und ausgerechnet die Fehlerseite der Anmeldung soll nicht
// an einem Meta-Ausfall mitsterben.
const FEHLER_HTML = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Anmeldung fehlgeschlagen – MedArbeiter One</title>
</head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:system-ui,sans-serif;background:#fafafa;color:#333">
  <main style="text-align:center;padding:2rem;max-width:26rem">
    <h1 style="font-size:1.25rem">Anmeldung fehlgeschlagen</h1>
    <p style="line-height:1.5">Die Anmeldung über MedArbeiter konnte nicht abgeschlossen
    werden – etwa weil sie im Hub abgebrochen wurde, die Seite neu geladen wurde
    oder die Anmeldung zu lange offen stand.</p>
    <a href="/anmelden" style="display:inline-block;margin-top:.5rem;padding:.6rem 1.2rem;border-radius:.6rem;background:#333;color:#fff;text-decoration:none">Erneut anmelden</a>
  </main>
</body>
</html>`;

function fehlerSeite(status: number) {
  const res = new NextResponse(FEHLER_HTML, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  res.cookies.delete(STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  let erwartet: { state?: string; weiter?: string } = {};
  try {
    erwartet = JSON.parse(request.cookies.get(STATE_COOKIE)?.value ?? "{}");
  } catch {
    // Ein kaputter Cookie ist wie kein Cookie – der state-Abgleich scheitert dann.
  }

  const code = query.get("code");
  if (query.get("error") || !code || !erwartet.state || query.get("state") !== erwartet.state)
    return fehlerSeite(400);

  try {
    // Der Code lebt 60 Sekunden und genau eine Einlösung – kein zweiter Versuch.
    const person = await redeemCode(code);
    const res = NextResponse.redirect(
      new URL(erwartet.weiter || "/", process.env.MEDARBEITER_REDIRECT_URI),
    );
    res.cookies.delete(STATE_COOKIE);
    res.cookies.set(SESSION_COOKIE, await sealSession(person, sessionSecret()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_MS / 1000,
      path: "/",
    });
    return res;
  } catch (e) {
    // Nur die Statusmeldung aus lib/hub.ts – nie Code oder Token ins Log.
    console.error("Anmeldung:", (e as Error).message);
    return fehlerSeite(502);
  }
}
