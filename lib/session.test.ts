import { expect, test } from "bun:test";
import { openSession, sealSession, SESSION_TTL_MS, type Person } from "./session";

const person: Person = {
  sub: "17",
  name: "Max Muster",
  email: "max@firma.de",
  role: "mitarbeiter",
  rechte: ["zeit.erfassen", "abwesenheit.beantragen"],
  picture: "https://hub.example/avatare/01-vertrieb-akquise-fuchs.png",
};

const secret = "test-secret";

test("a sealed session opens to the same person", async () => {
  const token = await sealSession(person, secret);
  expect(await openSession(token, secret)).toEqual(person);
});

test("a tampered payload does not open", async () => {
  const token = await sealSession(person, secret);
  // Wer im Payload aus sub 17 die 18 macht, darf nicht als Nummer 18 arbeiten.
  const [body, sig] = token.split(".");
  const forged =
    Buffer.from(Buffer.from(body!, "base64url").toString().replace('"17"', '"18"')).toString(
      "base64url",
    ) + `.${sig}`;
  expect(await openSession(forged, secret)).toBeNull();
});

test("a token sealed with another secret does not open", async () => {
  const token = await sealSession(person, "anderes-secret");
  expect(await openSession(token, secret)).toBeNull();
});

test("a session dies exactly at its TTL", async () => {
  const sealedAt = Date.now();
  const token = await sealSession(person, secret, sealedAt);
  expect(await openSession(token, secret, sealedAt + SESSION_TTL_MS - 1)).toEqual(person);
  expect(await openSession(token, secret, sealedAt + SESSION_TTL_MS)).toBeNull();
});

test("garbage and absence mean: log in again", async () => {
  expect(await openSession(undefined, secret)).toBeNull();
  expect(await openSession("", secret)).toBeNull();
  expect(await openSession("kein.token", secret)).toBeNull();
  expect(await openSession("nur-ein-teil", secret)).toBeNull();
});
