// Seeds the public demo journal on Tiramisu. Everything here is synthetic and labelled as such.
// Writes the entries with the app's own code path, then adds the two pieces of evidence the proof
// page shows: a forged entry with identical attributes from another wallet (ignored by the app)
// and a Lifetime Extension sent by a third wallet (allowed by the permissionless flag).
// Run: npx tsx scripts/seed-demo.ts   (ARKIV_PRIVATE_KEY funds the demo wallets; DEMO_PASSPHRASE in .env)
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { parseEther, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { ExpirationTime } from "@arkiv-network/sdk";
import { deriveKeys } from "../src/lib";
import { walletFor, writeEntry, extendEntry, publicClient, listEntries, APP } from "../src/arkiv/journal";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const funder = walletFor(env.ARKIV_PRIVATE_KEY as Hex);
// The demo passphrase lives only in .env: the site publishes a read-only link, so nobody can write as the demo journal.
const DEMO_PASSPHRASE = env.DEMO_PASSPHRASE!;
if (!DEMO_PASSPHRASE) throw new Error("DEMO_PASSPHRASE missing from .env");
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

// Each entry is written a few minutes after the moment it describes, the way a real journal is
// kept, so "You said it happened" and the proven "Written at" sit close together. Entries are
// spaced out in real time while seeding. One entry is written without permission to extend.
const ENTRIES = [
  { minutesAgo: 25, extendable: true, category: "digital", text: "[Synthetic demo entry] He went through my phone while I was in the shower and read my messages to my sister. He said I am not allowed to talk to her about us." },
  { minutesAgo: 15, extendable: false, category: "financial", text: "[Synthetic demo entry] My salary went into the joint account and he moved all of it out. When I asked for money for transport he said I should stay home." },
  { minutesAgo: 20, extendable: true, category: "threats", text: "[Synthetic demo entry] He said if I ever tell anyone he will make sure I lose my job and the children. He said it twice, standing in the doorway so I could not leave the room." },
  { minutesAgo: 10, extendable: true, category: "physical", text: "[Synthetic demo entry] He pushed me against the kitchen counter. My arm is bruised above the elbow. Photo attached (synthetic placeholder image).", photo: true },
] as const;
const GAP_MS = Number(process.env.SEED_GAP_MS ?? 120_000);

async function main() {
  const keys = await deriveKeys(DEMO_PASSPHRASE);
  log("demo journal", keys.address);
  const existing = await listEntries(keys.address, keys.contentKey);
  if (existing.length) { log("already seeded with", existing.length, "entries; nothing to do"); return; }
  log("fund demo journal", await fund(keys.address, "0.05"));

  const written: { key: Hex; tx: Hex; photo?: Hex; extendable: boolean }[] = [];
  for (const [i, e] of ENTRIES.entries()) {
    if (i) await new Promise((r) => setTimeout(r, GAP_MS));
    const photo = "photo" in e ? { bytes: syntheticPng(), mime: "image/png" } : undefined;
    const happenedAt = new Date(Date.now() - e.minutesAgo * 60_000).toISOString();
    const w = await writeEntry(keys.signingKey, keys.contentKey, { v: 1, happenedAt, category: e.category, text: e.text }, 2, photo, e.extendable);
    written.push({ key: w.entityKey, tx: w.txHash, photo: w.photoKey, extendable: e.extendable });
    log("entry", w.entityKey, w.txHash, e.extendable ? "extendable" : "fixed lifetime");
  }

  // Forger: plants a fake "retraction" labelled as this journal's entry. Only $creator decides what
  // belongs to the journal, so the app shows this as rejected.
  const forgerKey = generatePrivateKey();
  const forger = walletFor(forgerKey);
  await fund(forger.account.address, "0.005");
  const forged = await forger.createEntity({ payload: new TextEncoder().encode("[Synthetic planted entry] I made all of this up. Nothing happened."), contentType: "text/plain", attributes: { app: APP, kind: "entry", v: 1, journal: keys.address.toLowerCase() }, expires: ExpirationTime.fromYears(1) });
  await publicClient.waitForTransactionReceipt({ hash: forged.txHash });
  log("forged", forged.entityKey, "by", forger.account.address);

  // Supporter (a lawyer, say): keeps the first entry one more year, the same call the app makes.
  const supporterKey = generatePrivateKey();
  const supporter = walletFor(supporterKey);
  await fund(supporter.account.address, "0.005");
  const ext = await extendEntry(supporterKey, written[0]!.key, 1);
  log("extended", written[0]!.key, "by", supporter.account.address, ext.txHash);

  const evidence = {
    note: "Synthetic demo data on Arkiv Tiramisu (chain 7738577). No real person or event.",
    seededAt: new Date().toISOString(),
    wallets: [
      { role: "project funder: tops up new journal addresses", address: funder.account.address },
      { role: "demo journal: creator of every demo entry", address: keys.address },
      { role: "forger: plants a fake entry labelled as the demo journal's, rejected by the app", address: forger.account.address },
      { role: "supporter: keeps a demo entry one more year, as a lawyer would", address: supporter.account.address },
    ],
    entries: written,
    forged: { entityKey: forged.entityKey, txHash: forged.txHash },
    extension: { entityKey: written[0]!.key, txHash: ext.txHash },
  };
  writeFileSync("arkiv/evidence.json", JSON.stringify(evidence, null, 2) + "\n");
  log("wrote arkiv/evidence.json");
  writeFileSync(
    "src/demo.ts",
    "// The public demo journal (synthetic). Only its read-only link is published: the address and the\n" +
      "// content key. Its passphrase, and so its signing key, stays private, so nobody can write as it.\n" +
      `export const DEMO_ADDRESS = "${keys.address}";\n` +
      `export const DEMO_CONTENT_KEY = "${Buffer.from(keys.contentKeyRaw).toString("base64url")}";\n`,
  );
  log("wrote src/demo.ts");
}

main().catch((e) => { console.error(e); process.exit(1); });
