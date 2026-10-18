// Judges' reproduction script. Reads the demo journal straight from Arkiv (no Safe Journal server),
// with the exact queries the app runs, and prints what each claim rests on.
// Run: npm install && node scripts/verify.mjs
import { createPublicClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { http } from "viem";
import { readFileSync } from "node:fs";

const evidence = JSON.parse(readFileSync(new URL("../arkiv/evidence.json", import.meta.url), "utf8"));
const JOURNAL = evidence.wallets.find((w) => w.role.startsWith("demo journal")).address;
const BURN = "0x000000000000000000000000000000000000dEaD";
const c = createPublicClient({ chain: tiramisu, transport: http("https://rpc.tiramisu.db-chain.testnet.arkiv.network") });

// Query 1, the journal: entries created by this journal address only.
const mine = await c.select({ key: true, creator: true, owner: true, createdAt: true, expiresAt: true, creationFlags: true })
  .where([eq("app", "safejournal"), eq("kind", "entry")]).createdBy(JOURNAL).limit(100).fetch();
// Query 2, the same labels from anyone: shows what a label-only filter would wrongly include.
const any = await c.select({ key: true, creator: true }).where([eq("app", "safejournal"), eq("kind", "entry")]).limit(200).fetch();

console.log(`Demo journal ${JOURNAL}`);
for (const e of mine.entities.sort((a, b) => Number(a.createdAt - b.createdAt))) {
  const block = await c.getBlock({ blockNumber: e.createdAt });
  const years = (Number(e.expiresAt - e.createdAt) * 2 / (365.25 * 86400)).toFixed(1);
  console.log(`  ${e.key}\n    written ${new Date(Number(block.timestamp) * 1000).toISOString()} (block ${e.createdAt}), owner ${e.owner === BURN ? "burn address (cannot be deleted)" : e.owner}, permissionless extension ${e.creationFlags.permissionlessExtension}, lifetime ${years} years from creation`);
}
const foreign = any.entities.filter((e) => e.creator.toLowerCase() !== JOURNAL.toLowerCase());
console.log(`\nSame labels, other creators: ${foreign.length} (the forged demo entry ${evidence.forged.entityKey} is among them: ${foreign.some((e) => e.key === evidence.forged.entityKey)})`);
console.log(`createdBy(journal) returned ${mine.entities.length}; label-only query returned ${any.entities.length}.`);
console.log("\nPayloads are AES-256-GCM ciphertext; open the demo journal at https://safe-journal-seven.vercel.app/#/demo to read them with the published demo passphrase.");
