import { openDb, countUnanswered } from "@/lib/inbox-store";

/**
 * Dünn mit Absicht (wie app/api/suche/route.ts): der Poller (app/inbox/poller.tsx)
 * fragt das alle ~20s, ein warmer SQLite-Read kostet praktisch nichts.
 */
export function GET(request: Request) {
  const customer = new URL(request.url).searchParams.get("customer") ?? undefined;
  return Response.json({ count: countUnanswered(openDb(), customer) });
}
