/**
 * Ein hochgeladenes Profilbild vom Hub nachladen. `lib/hub.ts` setzt
 * `person.picture` für ein eigenes Foto genau auf diese Adresse – der Browser
 * hat keine Hub-Sitzung und könnte deren `/api/avatar/{id}` sonst nicht
 * lesen. Diese Route holt es stattdessen von Server zu Server, ausgewiesen
 * mit dem eigenen App-Geheimnis (derselbe Weg wie beim Token-Tausch), nicht
 * mit dem verbrauchten, einstündigen Zugriffstoken.
 *
 * Angemeldet bleibt hier wie im Hub die einzige Grenze, nicht "nur das
 * eigene Bild" – ein Profilbild ist dafür da, im Haus erkannt zu werden.
 */
import { cookies } from "next/headers";
import { basicAuth } from "@/lib/hub";
import { openSession, SESSION_COOKIE, sessionSecret } from "@/lib/session";

const hub = () => (process.env.MEDARBEITER_URL ?? "").replace(/\/$/, "");

export async function GET(_request: Request, { params }: { params: Promise<{ sub: string }> }) {
  const person = await openSession((await cookies()).get(SESSION_COOKIE)?.value, sessionSecret());
  if (!person) return new Response("Nicht berechtigt.", { status: 403 });

  const { sub } = await params;
  const upstream = await fetch(`${hub()}/api/avatar/${encodeURIComponent(sub)}`, {
    headers: {
      Authorization: basicAuth(
        process.env.MEDARBEITER_CLIENT_ID ?? "",
        process.env.MEDARBEITER_CLIENT_SECRET ?? "",
      ),
    },
  });
  if (!upstream.ok || !upstream.body) return new Response("Bild nicht abrufbar.", { status: upstream.status });

  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "private, max-age=300, must-revalidate",
    },
  });
}
