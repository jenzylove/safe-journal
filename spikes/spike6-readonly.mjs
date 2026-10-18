// Spike 6: does `readonly` combine with the burn-address handoff in the same batch, and with
// permissionless extension? Also: does a `journal` str attribute filter as expected?
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { ExpirationTime } from "@arkiv-network/sdk/utils";
import { eq } from "@arkiv-network/sdk/query";
import { http, parseEther, formatEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const BURN = "0x000000000000000000000000000000000000dEaD";
const A = privateKeyToAccount(env.ARKIV_PRIVATE_KEY);
const pub = createPublicClient({ chain: tiramisu, transport: http() });
const wA = createWalletClient({ chain: tiramisu, transport: http(), account: A });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const tryIt = async (label, fn) => { try { const r = await fn(); log("OK  ", label, r ?? ""); return r; } catch (e) { log("FAIL", label, "::", (e.shortMessage || e.message || String(e)).split("\n")[0]); return null; } };

const [k1] = await pub.predictEntityKeys({ owner: A.address, count: 1 });
const r = await tryIt("batch: readonly + permissionlessExtension + handoff to burn", async () => {
  const x = await wA.executeBatch({
    creates: [{ payload: randomBytes(64), contentType: "application/octet-stream", attributes: { app: "safejournal", kind: "spike", v: 1, journal: A.address.toLowerCase() }, expires: ExpirationTime.fromDays(3), flags: { readonly: true, permissionlessExtension: true }, salt: k1.salt }],
    ownershipChanges: [{ entityKey: k1.key, newOwner: BURN }],
  });
  await pub.waitForTransactionReceipt({ hash: x.txHash });
  return x.txHash;
});
if (r) {
  const e = await pub.getEntity(k1.key);
  log("read back", { owner: e.owner, flags: e.creationFlags, expiresAt: e.expiresAt });
  const B = privateKeyToAccount(generatePrivateKey());
  const wB = createWalletClient({ chain: tiramisu, transport: http(), account: B });
  await pub.waitForTransactionReceipt({ hash: await wA.sendTransaction({ to: B.address, value: parseEther("0.002") }) });
  await tryIt("stranger extends a readonly burn-owned entry", async () => {
    const x = await wB.extendEntity({ entityKey: k1.key, expires: ExpirationTime.atBlock(e.expiresAt + 1000n) });
    await pub.waitForTransactionReceipt({ hash: x.txHash });
    return x.txHash;
  });
  log("expiresAt after", (await pub.getEntity(k1.key)).expiresAt);
  const q = await pub.select({ key: true, creator: true }).where([eq("app", "safejournal"), eq("journal", A.address.toLowerCase())]).limit(10).fetch();
  log("journal attribute query found", q.entities.length);
}
log("balance", formatEther(await pub.getBalance({ address: A.address })));
