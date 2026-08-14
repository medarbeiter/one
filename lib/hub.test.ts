import { expect, test } from "bun:test";
import { authorizeUrl, basicAuth } from "./hub";

test("the authorize URL carries all four parameters and encodes the redirect URI", () => {
  process.env.MEDARBEITER_URL = "http://localhost:3001/";
  process.env.MEDARBEITER_CLIENT_ID = "abc-123";
  process.env.MEDARBEITER_REDIRECT_URI = "http://localhost:3000/anmelden/rueckkehr";

  const url = new URL(authorizeUrl("zufalls-state"));
  // Der abschließende Slash der Basis-URL darf keinen Doppelslash im Pfad erzeugen.
  expect(url.origin + url.pathname).toBe("http://localhost:3001/api/oauth/authorize");
  expect(url.searchParams.get("client_id")).toBe("abc-123");
  expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/anmelden/rueckkehr");
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("state")).toBe("zufalls-state");
});

test("basic auth URL-encodes id and secret before base64 (RFC 6749 appendix B)", () => {
  // Ein ":" oder "%" im Secret würde sonst die Trennung id:secret zerstören.
  expect(basicAuth("id", "ge:heim%")).toBe(
    "Basic " + Buffer.from("id:ge%3Aheim%25").toString("base64"),
  );
});
