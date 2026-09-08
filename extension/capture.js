// Läuft bei document_start: der Hash aus /campaigns/new („#mo_form=…“) muss
// gelesen sein, bevor die SPA ihn verwirft. sessionStorage überlebt den
// Router, aber nicht den Tab – genau richtig für eine Vorlage.
(() => {
  const m = location.hash.match(/[#&]mo_form=([A-Za-z0-9_-]+)/);
  if (!m) return;
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  );
  sessionStorage.setItem("mo_form", json);
  sessionStorage.removeItem("mo_form_done");
  history.replaceState(null, "", location.href.replace(/[#&]mo_form=[A-Za-z0-9_-]+/, ""));
})();
