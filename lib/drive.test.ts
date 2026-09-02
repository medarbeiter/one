import { expect, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { assertion, bestLanding, findSheet, folderIdFromUrl, landing, searchTerms, type DriveFile } from "./drive";

test("das JWT trägt Dienstkonto und Lesezugriff und ist mit dem Schlüssel signiert", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const jwt = assertion({ client_email: "sa@example.iam.gserviceaccount.com", private_key: pem }, 1_700_000_000_000);

  const [header, claims, sig] = jwt.split(".");
  expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
  expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
    iss: "sa@example.iam.gserviceaccount.com",
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  });
  const ok = createVerify("RSA-SHA256")
    .update(`${header}.${claims}`)
    .end()
    .verify(publicKey, Buffer.from(sig, "base64url"));
  expect(ok).toBe(true);
});

const FOLDER = "application/vnd.google-apps.folder";
const folder = (id: string, name: string): DriveFile => ({ id, name, mimeType: FOLDER });
const video = (id: string, name: string): DriveFile => ({ id, name, mimeType: "video/mp4", size: "1" });

const tree: Record<string, DriveFile[]> = {
  kunde: [folder("rec", "1 - Recruiting"), folder("misc", "2 - Sonstiges"), video("stray", "alt.mp4")],
  rec: [folder("ugc", "UGC Videos"), folder("fotos", "Fotos"), video("recvid", "briefing.mp4")],
  // Werbemotive schlägt UGC – in Recruiting selbst liegen nur Beispielvideos.
  motive: [folder("rec5", "1 - Mitarbeitergewinnung")],
  rec5: [video("bsp", "Beispielvideo 1 UGC.mp4"), folder("wm", "Werbemotive"), folder("ugc5", "UGC Videos")],
  wm: [video("m1", "Anna.mp4"), folder("wmugc", "UGC")],
  // Leeres Werbemotive: dann doch UGC daneben
  leer: [folder("rec6", "1 - Recruiting")],
  rec6: [folder("wm6", "Werbemotive"), folder("ugc6", "UGC Videos")],
  ugc6: [video("u6", "Ben.mp4")],
  ugc: [
    video("v1", "Anna.mp4"),
    { id: "pdf", name: "Skript.pdf", mimeType: "application/pdf" },
    { id: "jpg", name: "Thumb.jpg", mimeType: "image/jpeg" },
    folder("sub", "Rohmaterial"),
  ],
  nur: [folder("rec2", "1 - Mitarbeitergewinnung")],
  rec2: [video("r", "einzeln.mov")],
  // UGC-Mappe ohne Medien, aber mit einem klaren und einem einzigen Weg
  tief: [folder("rec3", "1 - Recruiting")],
  rec3: [folder("ugc3", "UGC")],
  ugc3: [folder("skript", "Skripte"), folder("vid", "Videos final")],
  vid: [folder("only", "Runde 2")],
  only: [video("deep", "Tom.mp4")],
  // Zwei gleichwertige Unterordner: stehen bleiben
  zwei: [folder("rec4", "1 - Recruiting")],
  rec4: [folder("ugc4", "UGC Videos")],
  ugc4: [folder("a", "Anna"), folder("b", "Ben")],
};
const kids = async (id: string) => tree[id] ?? [];
const names = (l: { path: DriveFile[]; entries: DriveFile[] }) => ({
  path: l.path.map((f) => f.name),
  entries: l.entries.map((f) => f.id),
});

test("läuft Kunde → Recruiting → UGC und zeigt Unterordner und Medien, sonst nichts", async () => {
  expect(names(await landing(folder("kunde", "Pflegedienst Hammonia"), kids))).toEqual({
    path: ["Pflegedienst Hammonia", "1 - Recruiting", "UGC Videos"],
    entries: ["v1", "jpg", "sub"],
  });
});

test("Werbemotive geht vor UGC und vor den Beispielvideos in Recruiting", async () => {
  expect(names(await landing(folder("motive", "Kunde"), kids))).toEqual({
    path: ["Kunde", "1 - Mitarbeitergewinnung", "Werbemotive"],
    entries: ["m1", "wmugc"],
  });
});

test("ein leeres Werbemotive verliert gegen ein volles UGC daneben", async () => {
  expect(names(await landing(folder("leer", "Kunde"), kids))).toEqual({
    path: ["Kunde", "1 - Recruiting", "UGC Videos"],
    entries: ["u6"],
  });
});

test("ohne UGC-Mappe bleibt es in Recruiting", async () => {
  expect(names(await landing(folder("nur", "Kunde"), kids))).toEqual({
    path: ["Kunde", "1 - Mitarbeitergewinnung"],
    entries: ["r"],
  });
});

test("ohne Medien geht es weiter: nach Video-Namen, dann in den einzigen Ordner", async () => {
  expect(names(await landing(folder("tief", "Kunde"), kids)).path).toEqual([
    "Kunde",
    "1 - Recruiting",
    "UGC",
    "Videos final",
    "Runde 2",
  ]);
});

test("bei zwei gleichwertigen Ordnern wird nicht geraten", async () => {
  const l = names(await landing(folder("zwei", "Kunde"), kids));
  expect(l.path).toEqual(["Kunde", "1 - Recruiting", "UGC Videos"]);
  expect(l.entries).toEqual(["a", "b"]);
});

test("der Kundenordner ist der Treffer, in dem der Weg am weitesten führt", async () => {
  // „Ergebnisse Hammonia“ steht alphabetisch vorn, ist aber ein Unterordner mit Fotos.
  tree.ergebnisse = [folder("fotos2", "Fotos (übrig)"), folder("post", "Postings")];
  const { folders, landed } = await bestLanding(
    [folder("ergebnisse", "Ergebnisse Hammonia"), folder("kunde", "Pflegedienst Hammonia")],
    kids,
  );
  expect(folders.map((f) => f.name)).toEqual(["Pflegedienst Hammonia", "Ergebnisse Hammonia"]);
  expect(landed?.path.map((f) => f.name)).toEqual(["Pflegedienst Hammonia", "1 - Recruiting", "UGC Videos"]);
});

test("Suchbegriffe: voll, ohne Rechtsform, dann das eigentliche Wort", () => {
  expect(searchTerms("Pflegedienst Hammonia GmbH")).toEqual([
    "Pflegedienst Hammonia GmbH",
    "Pflegedienst Hammonia",
    "Hammonia",
  ]);
  expect(searchTerms("Levivo Pflegedienst GmbH & Co. KG")).toEqual([
    "Levivo Pflegedienst GmbH & Co. KG",
    "Levivo Pflegedienst",
    "Levivo",
  ]);
  expect(searchTerms("Hammonia")).toEqual(["Hammonia"]);
});

test("folderIdFromUrl liest die Ordner-ID aus beiden Drive-Adressformen", () => {
  expect(folderIdFromUrl("https://drive.google.com/drive/folders/1AbC_dEf-9?usp=sharing")).toBe("1AbC_dEf-9");
  expect(folderIdFromUrl("https://drive.google.com/open?id=1AbC_dEf-9")).toBe("1AbC_dEf-9");
  expect(folderIdFromUrl("https://example.com")).toBeUndefined();
});

const SHEET = "application/vnd.google-apps.spreadsheet";
const f = (id: string, name: string, mimeType = FOLDER): DriveFile => ({ id, name, mimeType });

test("findSheet findet die Onboarding-Tabelle im Kundenordner, notfalls eine Ebene tiefer", async () => {
  const tree: Record<string, DriveFile[]> = {
    kunde: [f("rec", "1 - Recruiting"), f("ob", "AWO Rottweil Onboarding", SHEET)],
    rec: [],
  };
  const kids = async (id: string) => tree[id] ?? [];
  expect((await findSheet("kunde", kids))?.id).toBe("ob");

  const deeper: Record<string, DriveFile[]> = {
    kunde: [f("docs", "Dokumente")],
    docs: [f("ob2", "Onboarding-Tabelle", SHEET)],
  };
  expect((await findSheet("kunde", async (id) => deeper[id] ?? []))?.id).toBe("ob2");
});

test("findSheet gibt ohne Tabelle nichts zurück und gräbt nicht endlos", async () => {
  const loop: Record<string, DriveFile[]> = { a: [f("b", "x")], b: [f("a", "y")] };
  expect(await findSheet("a", async (id) => loop[id] ?? [])).toBeUndefined();
});
