/**
 * Ohne Sitzung keine Seite. Hier wird nur der signierte Cookie geprüft
 * (optimistischer Check, kein Datenbank- oder Hub-Aufruf) – das reicht, weil
 * jede Antwort des Hubs ohnehin erst über /anmelden hereinkommt.
 */
import { NextResponse, type NextRequest } from "next/server";
import { openSession, SESSION_COOKIE, sessionSecret } from "@/lib/session";

// Offen bleiben nur der Anmeldeweg selbst und der Docker-Healthcheck.
const OFFEN = new Set(["/anmelden", "/anmelden/rueckkehr", "/api/health"]);

export async function proxy(request: NextRequest) {
  const pfad = request.nextUrl.pathname;
  if (OFFEN.has(pfad)) return NextResponse.next();

  const person = await openSession(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  if (person) return NextResponse.next();

  // fetch-Aufrufer (Upload-Queue, Launch) können einem Redirect zum Hub nicht
  // folgen – sie bekommen die Lage als Fehler genannt.
  if (pfad.startsWith("/api/"))
    return NextResponse.json({ error: "Nicht angemeldet – Seite neu laden." }, { status: 401 });

  const ziel = new URL("/anmelden", request.nextUrl);
  const weiter = pfad + request.nextUrl.search;
  if (weiter !== "/") ziel.searchParams.set("weiter", weiter);
  return NextResponse.redirect(ziel);
}

export const config = {
  // Statische Auslieferung braucht keine Sitzung – alles andere schon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
