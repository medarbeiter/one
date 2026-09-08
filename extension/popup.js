const log = (t) => (document.getElementById("log").textContent = t);

async function send(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("https://business.facebook.com/latest/instant_forms")) {
    return log("Bitte zuerst die Instant-Forms-Seite der Kundenseite öffnen.");
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, msg);
    log(res?.log ?? "gestartet");
  } catch (e) {
    log(`Kein Kontakt zur Seite – neu laden und erneut versuchen. (${e.message})`);
  }
}

document.getElementById("run").onclick = () => {
  const text = document.getElementById("spec").value.trim();
  try {
    JSON.parse(text);
  } catch {
    return log("Das ist kein JSON.");
  }
  send({ type: "mo_build", spec: text });
};
document.getElementById("again").onclick = () => send({ type: "mo_build" });
