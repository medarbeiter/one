// Vorlage merken und den Baukasten in einem neuen Tab öffnen. content.js liest
// die Vorlage beim Laden aus chrome.storage.local – das überlebt Metas
// Weiterleitungen, anders als ein URL-Hash. Nicht storage.session: darauf
// dürfen Content Scripts ohne setAccessLevel nicht zugreifen, und der Fehler
// war unsichtbar.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "mo_open") return;
  chrome.storage.local.set({ mo_form: msg.spec, mo_form_done: false }).then(() => chrome.tabs.create({ url: msg.url })).then(() => reply({ ok: true }));
  return true;
});
