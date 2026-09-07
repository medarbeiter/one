/**
 * Läuft einmal beim Start des Servers (Next: instrumentation.ts). Der
 * Autopilot (lib/autopilot.ts) ist ausdrücklich einzuschalten – lokal legte
 * er sonst aus echten ClickUp-Aufgaben echte Kampagnen an.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.AUTOPILOT !== "1") return;
  const { autopilotTick, TICK_MS } = await import("./lib/autopilot");
  setInterval(() => void autopilotTick(), TICK_MS).unref();
}
