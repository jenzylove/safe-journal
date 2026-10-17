// Seeds the public demo journal on Tiramisu. Everything here is synthetic and labelled as such.
// Writes the entries with the app's own code path, then adds the two pieces of evidence the proof
// page shows: a forged entry with identical attributes from another wallet (ignored by the app)
// and a Lifetime Extension sent by a third wallet (allowed by the permissionless flag).
// Run: npx tsx scripts/seed-demo.ts   (ARKIV_PRIVATE_KEY in .env funds the demo wallets)
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { parseEther, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { ExpirationTime } from "@arkiv-network/sdk";
import { deriveKeys } from "../src/lib";
import { walletFor, writeEntry, publicClient, listEntries, APP } from "../src/arkiv/journal";
import { DEMO_PASSPHRASE } from "../src/demo";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const funder = walletFor(env.ARKIV_PRIVATE_KEY as Hex);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function fund(to: Hex, amount: string) {
  const hash = await funder.sendTransaction({ to, value: parseEther(amount) });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** A plain synthetic PNG (soft gradient) standing in for a photo. No real image is used. */
function syntheticPng(w = 320, h = 240): Uint8Array {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 180 + Math.round(40 * x / w); raw[o + 1] = 150 + Math.round(50 * y / h); raw[o + 2] = 160;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}

const ENTRIES = [
  { happenedAt: "2026-10-11T22:40:00+01:00", category: "digital", text: "[Synthetic demo entry] He went through my phone while I was in the shower and read my messages to my sister. He said I am not allowed to talk to her about us." },
  { happenedAt: "2026-10-13T19:15:00+01:00", category: "financial", text: "[Synthetic demo entry] My salary went into the joint account and he moved all of it out the same evening. When I asked for money for transport he said I should stay home." },
  { happenedAt: "2026-10-15T23:05:00+01:00", category: "threats", text: "[Synthetic demo entry] He said if I ever tell anyone he will make sure I lose my job and the children. He said it twice, standing in the doorway so I could not leave the room." },
  { happenedAt: "2026-10-17T21:30:00+01:00", category: "physical", text: "[Synthetic demo entry] He pushed me against the kitchen counter. My arm is bruised above the elbow. Photo attached (synthetic placeholder image)." , photo: true },
] as const;

async function main() {
  const keys = await deriveKeys(DEMO_PASSPHRASE);
  log("demo journal", keys.address);
  const existing = await listEntries(keys.address, keys.contentKey);
  if (existing.length) { log("already seeded with", existing.length, "entries; nothing to do"); return; }
  log("fund demo journal", await fund(keys.address, "0.05"));

  const written: { key: Hex; tx: Hex; photo?: Hex }[] = [];
  for (const e of ENTRIES) {
    const photo = "photo" in e ? { bytes: syntheticPng(), mime: "image/png" } : undefined;
    const w = await writeEntry(keys.signingKey, keys.contentKey, { v: 1, happenedAt: e.happenedAt, category: e.category, text: e.text }, 2, photo);
    written.push({ key: w.entityKey, tx: w.txHash, photo: w.photoKey });
    log("entry", w.entityKey, w.txHash);
  }

  // Forger: identical attributes, different creator. The app must not show it as part of the journal.
  const forgerKey = generatePrivateKey();
  const forger = walletFor(forgerKey);
  await fund(forger.account.address, "0.005");
  const forged = await forger.createEntity({ payload: new TextEncoder().encode("[Synthetic forged entry] Everything is fine, nothing happened."), contentType: "text/plain", attributes: { app: APP, kind: "entry", v: 1 }, expires: ExpirationTime.fromYears(1) });
  await publicClient.waitForTransactionReceipt({ hash: forged.txHash });
  log("forged", forged.entityKey, "by", forger.account.address);

  // Supporter: a third wallet keeps the first entry alive longer (permissionless extension).
  const supporter = walletFor(generatePrivateKey());
  await fund(supporter.account.address, "0.005");
  const ext = await supporter.extendEntity({ entityKey: written[0]!.key, expires: ExpirationTime.fromYears(3) });
  await publicClient.waitForTransactionReceipt({ hash: ext.txHash });
  log("extended", written[0]!.key, "by", supporter.account.address, ext.txHash);

  const evidence = {
    note: "Synthetic demo data on Arkiv Tiramisu (chain 7738577). No real person or event.",
    seededAt: new Date().toISOString(),
    wallets: [
      { role: "project funder: tops up new journal addresses", address: funder.account.address },
      { role: "demo journal: creator of every demo entry", address: keys.address },
      { role: "forger: writes an entry with identical attributes, ignored by the app", address: forger.account.address },
      { role: "supporter: extends a demo entry's lifetime", address: supporter.account.address },
    ],
    entries: written,
    forged: { entityKey: forged.entityKey, txHash: forged.txHash },
    extension: { entityKey: written[0]!.key, txHash: ext.txHash },
  };
  writeFileSync("arkiv/evidence.json", JSON.stringify(evidence, null, 2) + "\n");
  log("wrote arkiv/evidence.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
