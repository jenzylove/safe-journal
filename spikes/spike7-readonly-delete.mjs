// Spike 7 (backs friction F13): can the OWNER still delete an entity created with readonly: true?
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { ExpirationTime } from "@arkiv-network/sdk/utils";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const A = privateKeyToAccount(env.ARKIV_PRIVATE_KEY);
const pub = createPublicClient({ chain: tiramisu, transport: http() });
const w = createWalletClient({ chain: tiramisu, transport: http(), account: A });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const c = await w.createEntity({ payload: randomBytes(32), contentType: "application/octet-stream", attributes: { app: "safejournal", kind: "spike", v: 1 }, expires: ExpirationTime.fromHours(2), flags: { readonly: true } });
await pub.waitForTransactionReceipt({ hash: c.txHash });
log("created readonly entity", c.entityKey, "owner", (await pub.getEntity(c.entityKey)).owner);
try { const p = await w.patchEntity({ entityKey: c.entityKey, set: { v: 2 } }); await pub.waitForTransactionReceipt({ hash: p.txHash }); log("patch by owner: SUCCEEDED", p.txHash); } catch (e) { log("patch by owner: refused ::", (e.shortMessage || e.message).split("\n")[0]); }
try { const d = await w.deleteEntity({ entityKey: c.entityKey }); await pub.waitForTransactionReceipt({ hash: d.txHash }); log("delete by owner: SUCCEEDED", d.txHash); } catch (e) { log("delete by owner: refused ::", (e.shortMessage || e.message).split("\n")[0]); }
try { await pub.getEntity(c.entityKey); log("entity still exists"); } catch (e) { log("entity gone ::", (e.shortMessage || e.message).split("\n")[0]); }
