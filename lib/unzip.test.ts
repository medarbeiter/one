import { expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { unzipMedia } from "./unzip";

/** Ein ZIP von Hand – genau die Bytes, die der Parser liest. CRCs bleiben 0. */
function buildZip(
  entries: { name: string; data: Uint8Array<ArrayBuffer>; deflate?: boolean }[],
): File {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const { name, data, deflate } of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const payload = deflate ? new Uint8Array(deflateRawSync(data)) : data;
    const method = deflate ? 8 : 0;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, method, true);
    local.setUint32(18, payload.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, payload);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(10, method, true);
    dir.setUint32(20, payload.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + payload.length;
  }

  const cdirSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdirSize, true);
  eocd.setUint32(16, offset, true);
  return new File([...parts, ...central, new Uint8Array(eocd.buffer)], "test.zip");
}

const bytes = (s: string) => new TextEncoder().encode(s);

test("packt Medien aus, mit MIME-Typ und ohne Pfad", async () => {
  const zip = buildZip([
    { name: "kampagne/", data: new Uint8Array(0) },
    { name: "kampagne/Creative 1.png", data: bytes("png-bytes") },
    { name: "kampagne/clip.MP4", data: bytes("mp4-bytes"), deflate: true },
    { name: "__MACOSX/kampagne/._Creative 1.png", data: bytes("junk") },
    { name: "kampagne/.DS_Store", data: bytes("junk") },
    { name: "kampagne/notizen.txt", data: bytes("text") },
  ]);

  const files = await unzipMedia(zip);
  expect(files.map((f) => [f.name, f.type])).toEqual([
    ["Creative 1.png", "image/png"],
    ["clip.MP4", "video/mp4"],
  ]);
  // Der Deflate-Weg liefert die Originalbytes zurück.
  expect(await files[1].text()).toBe("mp4-bytes");
  expect(await files[0].text()).toBe("png-bytes");
});

test("wirft bei Nicht-ZIPs und bei Archiven ohne Medien", async () => {
  await expect(unzipMedia(new File([bytes("kein zip")], "x.zip"))).rejects.toThrow(
    "Keine lesbare ZIP-Datei",
  );
  await expect(
    unzipMedia(buildZip([{ name: "notizen.txt", data: bytes("text") }])),
  ).rejects.toThrow("keine Bilder oder Videos");
});
