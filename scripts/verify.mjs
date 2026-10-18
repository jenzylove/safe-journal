// Judges' reproduction script. Reads the demo journal straight from Arkiv (no Safe Journal server),
// with the exact queries the app runs, and prints what each claim rests on.
// Run: npm install && node scripts/verify.mjs
import { createPublicClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { http } from "viem";
import { readFileSync } from "node:fs";

const evidence = JSON.parse(readFileSync(new URL("../arkiv/evidence.json", import.meta.url), "utf8"));
const role = (r) => evidence.wallets.find((w) => w.role.startsWith(r)).address;
const JOURNAL = role("demo journal");
const BURN = "0x000000000000000000000000000000000000dEaD";
const YEAR = (365.25 * 86400) / 2;
const c = createPublicClient({ chain: tiramisu, transport: http("https://rpc.tiramisu.db-chain.testnet.arkiv.network") });

// Query 1, the journal: entries CREATED BY this journal address. This is the app's whole read path.
const mine = await c.select({ key: true, creator: true, owner: true, createdAt: true, expiresAt: true, creationFlags: true })
  .where([eq("app", "safejournal"), eq("kind", "entry")]).createdBy(JOURNAL).limit(100).fetch();
// Query 2, the same journal by its writable label: anyone can put this label on an entry.
const labelled = await c.select({ key: true, creator: true })
  .where([eq("app", "safejournal"), eq("kind", "entry"), eq("journal", JOURNAL.toLowerCase())]).limit(50).fetch();

console.log(`Demo journal ${JOURNAL}`);
for (const e of [...mine.entities].sort((a, b) => Number(a.createdAt - b.createdAt))) {
  const block = await c.getBlock({ blockNumber: e.createdAt });
  const years = (Number(e.expiresAt - e.createdAt) / YEAR).toFixed(1);
  console.log(`  ${e.key}\n    written ${new Date(Number(block.timestamp) * 1000).toISOString()} (block ${e.createdAt}), owner ${e.owner === BURN ? "burn address" : e.owner}, readonly ${e.creationFlags.readonly}, extendable ${e.creationFlags.permissionlessExtension}, lifetime ${years} years`);
}
const planted = labelled.entities.filter((e) => e.creator.toLowerCase() !== JOURNAL.toLowerCase());
console.log(`\nCarry the journal's label: ${labelled.entities.length}. Of those, written by another wallet (planted, rejected by the app): ${planted.length}${planted.length ? ` (${planted.map((p) => `${p.key.slice(0, 10)}… by ${p.creator}`).join(", ")})` : ""}`);
const ext = await c.getTransaction({ hash: evidence.extension.txHash });
console.log(`Extension of ${evidence.extension.entityKey.slice(0, 10)}… was sent by ${ext.from} (not the journal: ${ext.from.toLowerCase() !== JOURNAL.toLowerCase()})`);
console.log("\nPayloads are AES-256-GCM ciphertext. Read the demo journal through its published read link at https://safe-journal-seven.vercel.app/#/demo");
