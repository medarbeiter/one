// Läuft auf der App (/campaigns/new). Meldet der Seite, dass die Erweiterung
// da ist, und reicht „In Meta bauen“ an den Service Worker weiter – der öffnet
// den Baukasten mit der Vorlage. Kein Hash, kein Einfügen.
document.documentElement.dataset.moFormExt = chrome.runtime.getManifest().version;
window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.type !== "mo_form:build") return;
  chrome.runtime.sendMessage({ type: "mo_open", url: e.data.url, spec: e.data.spec }, (res) => {
    window.postMessage({ type: "mo_form:opened", ok: !chrome.runtime.lastError, error: chrome.runtime.lastError?.message }, "*");
  });
});
