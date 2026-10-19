// Reproduces the items of arkiv/friction.md that only read, against the live Tiramisu node.
// No private key and no GLM needed. Items that write (F3, F4, F7, F9, F13) need a funded key and
// live in spikes/. Output from the last run is saved in arkiv/friction-repro.out.txt.
//
//   npm install && node scripts/friction-repro.mjs
import { readFileSync, readdirSync } from "node:fs";
import { createPublicClient, createWalletClient, ENTITY_EVENTS_ABI } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { getAbiItem, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const RPC = "https://rpc.tiramisu.db-chain.testnet.arkiv.network";
const ENTRY = "0x81c89d1043883567ccf35851eec52de4f14e06940678ee0a4780f26de37e6c9a"; // demo entry, see arkiv/evidence.json
const JOURNAL = "0x45259EADD9aBa97e0BC51f74ca2B7D2b90d91Fa7";
const sent = [];
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, { retryCount: 0, onFetchRequest: async (r) => { sent.push(JSON.parse(await r.clone().text()).method); } }) });
const say = (id, line) => console.log(`${id.padEnd(4)} ${line}`);

console.log(`SDK @arkiv-network/sdk ${JSON.parse(readFileSync("node_modules/@arkiv-network/sdk/package.json", "utf8")).version}, Tiramisu ${RPC}, ${new Date().toISOString()}\n`);

// F1: no expiry event.
const dir = "node_modules/@arkiv-network/sdk/dist";
const dts = readdirSync(dir).filter((f) => f.endsWith(".d.ts")).map((f) => readFileSync(`${dir}/${f}`, "utf8")).find((s) => s.includes("WatchEntityEventsParameters"));
const handlers = [...new Set((dts.match(/\bon[A-Z][A-Za-z]+(?=\?:)/g) ?? []))];
say("F1", `watchEntityEvents handlers: ${handlers.join(", ")}. Expiry handler present: ${handlers.some((h) => /expir/i.test(h) && !/Extended/.test(h))}`);

// F2: predictEntityKeys lives on the public client only.
const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC), account: privateKeyToAccount(generatePrivateKey()) });
say("F2", `typeof walletClient.predictEntityKeys = ${typeof wallet.predictEntityKeys}, typeof publicClient.predictEntityKeys = ${typeof pub.predictEntityKeys}`);

// F6 and F8: what an entity carries.
sent.length = 0;
const e = await pub.getEntity(ENTRY);
const fields = Object.keys(e).filter((k) => typeof e[k] !== "function");
say("F6", `getEntity fields: ${fields.join(", ")}. A creating transaction field: ${fields.some((f) => /tx|transaction|hash/i.test(f))}`);
say("F8", `attributes come back as ${JSON.stringify(e.attributes, (_, v) => (typeof v === "bigint" ? Number(v) : v))}`);
say("F15", `SDK getEntity sent: ${sent.join(", ")} (the node also serves arkiv_getEntity, which the SDK does not use)`);

// F14: the creating log carries owner, not creator, and no attributes.
const created = getAbiItem({ abi: ENTITY_EVENTS_ABI, name: "EntityCreated" });
const [log] = await pub.getLogs({ event: created, args: { entityKey: ENTRY }, fromBlock: e.createdAt, toBlock: e.createdAt });
say("F14", `EntityCreated args: ${Object.keys(log.args).join(", ")}. owner on the event = ${log.args.owner} (the journal); owner now = ${e.owner} (handed off in the same tx ${log.transactionHash})`);

// F10 and F15: what each call costs. A query the node rejects is billed like one it answers.
async function cost(label, method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const b = await r.json();
  say("F15", `${label.padEnd(44)} HTTP ${r.status}, arkiv-cost ${r.headers.get("arkiv-cost") ?? "none"}, ${b.error ? "error: " + b.error.message.slice(0, 70) : "answered"}`);
}
await cost("valid query", "arkiv_query", [`app = str('safejournal') AND $creator = addr(${JOURNAL})`, { limit: "0x1" }]);
await cost("query with a syntax error", "arkiv_query", ["this is not a query", { limit: "0x1" }]);
await cost("query with an unknown option", "arkiv_query", ["app = str('safejournal')", { resultsPerPage: "0x1" }]);
await cost("query with an untyped hex literal", "arkiv_query", [`$key = ${ENTRY}`, { limit: "0x1" }]);
await cost("arkiv_getEntity (same entity)", "arkiv_getEntity", [ENTRY]);
await cost("arkiv_getEntityCount", "arkiv_getEntityCount", []);
