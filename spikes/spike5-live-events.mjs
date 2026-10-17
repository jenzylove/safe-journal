// Spike 5: live updates over WebSocket filtered by owner/creator, and read latency.
// Watches entity events over WSS (no fromBlock), writes one entity, measures how long until the
// created event arrives, and what fields the event carries.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { ExpirationTime } from "@arkiv-network/sdk/utils";
import { http, webSocket } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2)));
const A = privateKeyToAccount(env.ARKIV_PRIVATE_KEY);
const ws = createPublicClient({ chain: tiramisu, transport: webSocket("wss://rpc.tiramisu.db-chain.testnet.arkiv.network") });
const wallet = createWalletClient({ chain: tiramisu, transport: http(), account: A });
const t0 = Date.now();
let seen = 0, ours = null, sent = 0;
const unwatch = await ws.watchEntityEvents({
  onEvent: (e) => { seen++; if (seen <= 2) console.log("sample event", JSON.stringify(e, (k, v) => typeof v === "bigint" ? v.toString() : v)); },
  onEntityCreated: (e) => { if (e.owner?.toLowerCase() === A.address.toLowerCase() || e.creator?.toLowerCase?.() === A.address.toLowerCase()) { ours = e; console.log("OUR create event after", Date.now() - sent, "ms", Object.keys(e)); } },
  onError: (err) => console.log("watch error", err.message),
});
await new Promise(r => setTimeout(r, 3000));
sent = Date.now();
const { txHash, entityKey } = await wallet.createEntity({ payload: randomBytes(64), contentType: "application/octet-stream", attributes: { app: "safejournal", kind: "sizetest", v: 1 }, expires: ExpirationTime.fromHours(1) });
console.log("write returned after", Date.now() - sent, "ms", entityKey, txHash);
await new Promise(r => setTimeout(r, 15000));
console.log("events seen in", Date.now() - t0, "ms:", seen, "ours:", !!ours);
unwatch(); process.exit(0);
