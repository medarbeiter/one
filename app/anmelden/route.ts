/**
 * Startet die Anmeldung über den MedArbeiter-Hub. Still ist der Umweg nie:
 * der Hub zeigt immer seine Freigabeseite (und davor die Anmeldung, falls
 * dort keine Sitzung lebt) – eine abgelaufene eigene Sitzung kostet die
 * Person also genau einen bestätigenden Klick.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, STATE_COOKIE } from "@/lib/hub";

export function GET(request: NextRequest) {
  const state = crypto.randomUUID();
  // Nur eigene Pfade als Rücksprungziel – alles andere wäre ein offener
  // Redirect, und "//host" liest der Browser als schemarelative Fremd-URL.
  const gewuenscht = request.nextUrl.searchParams.get("weiter") ?? "/";
  const weiter = gewuenscht.startsWith("/") && !gewuenscht.startsWith("//") ? gewuenscht : "/";

  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, weiter }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
