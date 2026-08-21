/**
 * Metas Echtzeit-Weg: GET beantwortet die einmalige Prüfung beim Einrichten
 * (README), POST liefert jede Änderung, sobald sie passiert.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (params.get("hub.mode") === "subscribe" && token && params.get("hub.verify_token") === token)
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

function validSignature(body: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const want = Buffer.from(expected, "hex");
  // Länge zuerst: timingSafeEqual wirft bei ungleicher Länge, statt false zu liefern.
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!validSignature(body, request.headers.get("x-hub-signature-256")))
    return new Response("Forbidden", { status: 403 });

  // Entry-Verarbeitung folgt in Task 7 (ingestWebhookEntry).
  return new Response("OK", { status: 200 });
}
