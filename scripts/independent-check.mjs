// Independent check: reads and opens a Safe Journal using nothing but arkiv/schema.md.
// No Arkiv SDK, no viem, no packages: plain JSON-RPC over fetch and WebCrypto from Node.
// If this file agrees with the app, the data contract is complete enough for anyone to build
// their own reader, lawyer tool or court export without us.
//
//   node scripts/independent-check.mjs                      the demo journal (its read link is public)
//   node scripts/independent-check.mjs "<lawyer link>"      any share link: #/lawyer?a=...&k=... or &s=...
//   node scripts/independent-check.mjs 0xJournalAddress     labels, owner and times only, nothing decrypted

const RPC = process.env.ARKIV_RPC || "https://rpc.tiramisu.db-chain.testnet.arkiv.network";
const BURN = "0x000000000000000000000000000000000000dead";
const SECONDS_PER_BLOCK = 2;
// keccak256("EntityCreated(bytes32,address,uint64,uint8)"); entityKey is the first indexed topic.
const ENTITY_CREATED = "0xb282d7c494b8899aa8015cd07be621530beb03409eb8c5e8fdc1411ba64356a5";
const DEMO = "https://safe-journal-seven.vercel.app/#/lawyer?a=0x45259EADD9aBa97e0BC51f74ca2B7D2b90d91Fa7&k=aZojS65WUACmhqUIi02TtA7XaoDGpK9IKZW52Ser2oQ";

let paid = 0;
let calls = 0;
async function rpc(method, params) {
  calls++;
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: calls, method, params }) });
  paid += Number(res.headers.get("arkiv-cost") || 0);
  if (res.status === 429) throw new Error(`rate limited by the public RPC (retry after ${res.headers.get("retry-after")} s)`);
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const hex = (s) => Uint8Array.from(s.replace(/^0x/, "").match(/../g) ?? [], (b) => parseInt(b, 16));
const b64url = (s) => Uint8Array.from(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
const toHex = (u) => "0x" + Buffer.from(u).toString("hex");
const enc = (s) => new TextEncoder().encode(s);
const aesKey = (raw) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
const gcm = async (key, iv, data, aad) => new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, data));

// Input: a share link, a bare address, or nothing (the demo journal).
const arg = process.argv[2] || DEMO;
let journal, contentKey = null;
const shared = new Map();
if (/^0x[0-9a-fA-F]{40}$/.test(arg)) journal = arg;
else {
  const q = new URLSearchParams(arg.slice(arg.indexOf("?") + 1));
  journal = q.get("a");
  if (q.get("k")) contentKey = await aesKey(b64url(q.get("k")));
  if (q.get("s")) {
    const bundle = b64url(q.get("s"));
    for (let i = 0; i + 64 <= bundle.length; i += 64) shared.set(toHex(bundle.slice(i, i + 32)), bundle.slice(i + 32, i + 64));
  }
}
if (!/^0x[0-9a-fA-F]{40}$/.test(journal || "")) throw new Error("Give a journal address or a share link with a=0x...");
const me = journal.toLowerCase();

// Payload format 2 (schema.md): 0x02 | 12 byte IV | entry key wrapped by the content key (32 + 16) | 0x01 | 12 byte IV | body
async function openEntry(payload, entityKey) {
  const k = entityKey.toLowerCase();
  let entryKey = shared.get(k);
  if (payload[0] !== 2) return null;
  if (!entryKey && contentKey) entryKey = await gcm(contentKey, payload.slice(1, 13), payload.slice(13, 61), enc(`safejournal/v2/wrap/${k}`));
  if (!entryKey) return null;
  const body = payload.slice(61);
  if (body[0] !== 1) return null;
  const padded = await gcm(await aesKey(entryKey), body.slice(1, 13), body.slice(13), enc(`safejournal/v1/entry/${k}/0`));
  const len = new DataView(padded.buffer).getUint32(0);
  return { entry: JSON.parse(new TextDecoder().decode(padded.slice(4, 4 + len))), paddedTo: padded.length };
}

console.log(`Journal ${journal}`);
console.log(`RPC ${RPC} (no SDK)\n`);

// 1. Trust comes from $creator: only entries this journal's own key wrote.
const select = { key: true, owner: false, creator: false, createdAt: false, updatedAt: false, expiresAt: false, creationFlags: false, contentType: false, payload: false, attributeSchema: false, attributes: false };
const mine = await rpc("arkiv_query", [`app = str('safejournal') AND kind = str('entry') AND $creator = addr(${journal})`, { select, limit: "0x64" }]);
const head = Number(await rpc("eth_blockNumber", []));

let opened = 0;
for (const { key } of mine.data) {
  // 2. One entity by key: arkiv_getEntity carries no query cost, unlike arkiv_query.
  const e = await rpc("arkiv_getEntity", [key]);
  const block = Number(e.createdAt);
  const [b, logs] = await Promise.all([
    rpc("eth_getBlockByNumber", [e.createdAt, false]),
    rpc("eth_getLogs", [{ fromBlock: e.createdAt, toBlock: e.createdAt, topics: [ENTITY_CREATED, key] }]),
  ]);
  const years = ((Number(e.expiresAt) - head) * SECONDS_PER_BLOCK) / (365.25 * 86400);
  console.log(`${key}`);
  console.log(`  written   ${new Date(Number(b.timestamp) * 1000).toISOString()} in block ${block}, tx ${logs[0]?.transactionHash ?? "not found"}`);
  console.log(`  locked    owner ${e.owner.toLowerCase() === BURN ? "burn address (nobody can delete it)" : e.owner}, readonly ${e.creationFlags.readonly}, others may extend ${e.creationFlags.permissionlessExtension}, about ${years.toFixed(1)} years left`);
  const out = await openEntry(hex(e.payload), key).catch(() => null);
  if (out) {
    opened++;
    console.log(`  opened    ${out.entry.category}, she said it happened ${out.entry.happenedAt}, text padded to ${out.paddedTo} bytes`);
    console.log(`            "${out.entry.text.slice(0, 90)}${out.entry.text.length > 90 ? "…" : ""}"`);
  } else console.log(`  locked    ${hex(e.payload).length} bytes of ciphertext; this link does not open it`);
}

// 3. Planted entries: anyone can write the journal label, only $creator decides.
const labelled = await rpc("arkiv_query", [`app = str('safejournal') AND kind = str('entry') AND journal = str('${me}')`, { select: { ...select, creator: true }, limit: "0x32" }]);
const planted = labelled.data.filter((x) => x.creator.toLowerCase() !== me);

console.log(`\n${mine.data.length} entries written by this journal, ${opened} opened with the link.`);
console.log(`${labelled.data.length} entities carry this journal's label; ${planted.length} of them ${planted.length === 1 ? "was" : "were"} written by another wallet and ${planted.length === 1 ? "is" : "are"} rejected${planted.length ? ": " + planted.map((p) => `${p.key.slice(0, 10)}… by ${p.creator}`).join(", ") : ""}.`);
console.log(`${calls} RPC calls, query cost ${paid} (two arkiv_query calls; arkiv_getEntity, blocks and logs report no cost).`);
