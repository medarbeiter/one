/** bun test – der Datenschutz-Link wird von der Startseite abgelesen, ohne Netz. */
import { expect, test } from "bun:test";
import { normalizeWebsite, pickPrivacyLink } from "./privacy-url";

const html = `<nav><a href="/jobs">Jobs</a><a class="x" href='/impressum'>Impressum</a>
<a href="/rechtliches/">Datenschutz<span>erklärung</span></a></nav>`;

test("datenschutz vor impressum, relativ wird absolut", () => {
  expect(pickPrivacyLink(html, "https://vitalcura.de/")).toBe("https://vitalcura.de/rechtliches/");
  expect(pickPrivacyLink('<a href="/impressum">Impressum</a>', "https://x.de")).toBe("https://x.de/impressum");
  expect(pickPrivacyLink("<p>nichts</p>", "https://x.de/")).toBe("https://x.de/");
});

test("Websites aus der Kundenübersicht bekommen ein Schema", () => {
  expect(normalizeWebsite("vitalcura.de")).toBe("https://vitalcura.de/");
  expect(normalizeWebsite("http://x.de/a")).toBe("http://x.de/a");
  expect(normalizeWebsite("")).toBe("");
});
