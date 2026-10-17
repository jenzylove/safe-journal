// Spike 1, 2, 3, 4: one batch that creates an entry plus a photo chunk and hands both to a burn
// address; then delete and patch from the creator (should revert), a stranger's Lifetime Extension
// (should succeed with the permissionless flag), a forged entry from another wallet, a createdBy
// query, gas per write, and the largest payload the public RPC accepts.
// Run: node spikes/spike1-batch-ownership.mjs   (reads ARKIV_PRIVATE_KEY from .env)
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { ExpirationTime } from "@arkiv-network/sdk/utils";
import { eq } from "@arkiv-network/sdk/query";
import { http, parseEther, formatEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2)));
const BURN = "0x000000000000000000000000000000000000dEaD";
const A = privateKeyToAccount(env.ARKIV_PRIVATE_KEY);
const pub = createPublicClient({ chain: tiramisu, transport: http() });
const walletA = createWalletClient({ chain: tiramisu, transport: http(), account: A });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const tryIt = async (label, fn) => { try { const r = await fn(); log("OK  ", label, r ?? ""); return r; } catch (e) { log("FAIL", label, "::", (e.shortMessage || e.message || String(e)).split("\n")[0]); return null; } };
const receiptCost = async (hash) => { const r = await pub.waitForTransactionReceipt({ hash }); return { status: r.status, gasUsed: r.gasUsed, cost: formatEther(r.gasUsed * r.effectiveGasPrice) + " GLM", block: r.blockNumber }; };

log("A", A.address, "balance", formatEther(await pub.getBalance({ address: A.address })), "GLM");
log("predictEntityKeys on wallet?", typeof walletA.predictEntityKeys, "on public?", typeof pub.predictEntityKeys);

const attrs = (kind) => ({ app: "safejournal", kind, v: 1 });
const predictor = typeof walletA.predictEntityKeys === "function" ? walletA : pub;

// 1. batch: entry (2 KB) + photo chunk (15 KB), both to the burn address, permissionless extension, 5 years
const [kEntry, kPhoto] = await predictor.predictEntityKeys({ owner: A.address, count: 2 });
const batch = await tryIt("batch create entry+photo, ownership -> burn, 5y, permissionless", async () => {
  const r = await walletA.executeBatch({
    creates: [
      { payload: randomBytes(2048), contentType: "application/octet-stream", attributes: attrs("entry"), expires: ExpirationTime.fromYears(5), flags: { permissionlessExtension: true }, salt: kEntry.salt },
      { payload: randomBytes(15000), contentType: "application/octet-stream", attributes: { ...attrs("photo"), part: 0, of: 1 }, expires: ExpirationTime.fromYears(5), flags: { permissionlessExtension: true }, salt: kPhoto.salt },
    ],
    ownershipChanges: [{ entityKey: kEntry.key, newOwner: BURN }, { entityKey: kPhoto.key, newOwner: BURN }],
  });
  return { ...r, receipt: await receiptCost(r.txHash), predictedMatch: r.createdEntities[0] === kEntry.key && r.createdEntities[1] === kPhoto.key };
});

if (batch) {
  const e = await pub.getEntity(kEntry.key);
  log("entry read back", { owner: e.owner, creator: e.creator, createdAt: e.createdAt, expiresAt: e.expiresAt, flags: e.creationFlags });
  await tryIt("delete from creator (expect revert)", async () => receiptCost((await walletA.deleteEntity({ entityKey: kEntry.key })).txHash));
  await tryIt("patch from creator (expect revert)", async () => receiptCost((await walletA.patchEntity({ entityKey: kEntry.key, set: { v: 2 } })).txHash));

  // stranger B: fund, extend, forge
  const B = privateKeyToAccount(generatePrivateKey());
  const walletB = createWalletClient({ chain: tiramisu, transport: http(), account: B });
  await tryIt("fund B 0.01 GLM", async () => receiptCost(await walletA.sendTransaction({ to: B.address, value: parseEther("0.01") })));
  await tryIt("B extends entry (permissionless, expect OK)", async () => receiptCost((await walletB.extendEntity({ entityKey: kEntry.key, expires: ExpirationTime.fromYears(6) })).txHash));
  log("entry expiresAt after B", (await pub.getEntity(kEntry.key)).expiresAt);
  await tryIt("B forges entry with identical attributes", async () => receiptCost((await walletB.createEntity({ payload: randomBytes(64), contentType: "application/octet-stream", attributes: attrs("entry"), expires: ExpirationTime.fromDays(1) })).txHash));
  log("B address", B.address);

  // query: createdBy(A) vs everything with the attributes
  const mine = await tryIt("query createdBy(A) app+kind=entry", async () => (await pub.select({ key: true, creator: true, owner: true }).where([eq("app", "safejournal"), eq("kind", "entry")]).createdBy(A.address).limit(50).fetch()).entities.length);
  const all = await tryIt("query any creator app+kind=entry", async () => (await pub.select({ key: true, creator: true }).where([eq("app", "safejournal"), eq("kind", "entry")]).limit(50).fetch()).entities.map(x => x.creator));
}

// size ladder: single create
for (const kb of [20, 40, 64, 100, 127]) {
  const ok = await tryIt(`single create ${kb} KB`, async () => receiptCost((await walletA.createEntity({ payload: randomBytes(kb * 1024), contentType: "application/octet-stream", attributes: attrs("sizetest"), expires: ExpirationTime.fromHours(2) })).txHash));
  if (!ok) break;
}
// batch ladder: two creates
for (const kb of [20, 40, 60]) {
  const ok = await tryIt(`batch of 2 x ${kb / 2} KB`, async () => receiptCost((await walletA.executeBatch({ creates: [0, 1].map(() => ({ payload: randomBytes((kb / 2) * 1024), contentType: "application/octet-stream", attributes: attrs("sizetest"), expires: ExpirationTime.fromHours(2) })) })).txHash));
  if (!ok) break;
}
await tryIt("permanent expiry accepted", async () => receiptCost((await walletA.createEntity({ payload: randomBytes(32), contentType: "application/octet-stream", attributes: attrs("sizetest"), expires: ExpirationTime.permanent() })).txHash));
log("A balance end", formatEther(await pub.getBalance({ address: A.address })), "GLM");
