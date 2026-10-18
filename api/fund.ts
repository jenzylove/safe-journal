// Funding endpoint. A passphrase-derived journal address starts with no test GLM, and the Tiramisu
// faucet needs a browser wallet, so this sends a journal a small amount when it runs low. It
// receives an address and a proof of work. It does not receive content, passphrases or keys.
//
// Abuse resistance, all checked against the chain so it holds across every server instance:
// - a proof of work bound to the address and the hour (stateless);
// - the first top up only goes to an address that has never sent a transaction, so replaying a
//   proof after spending the GLM gets nothing;
// - later top ups only go to an address that has written journal entries, with most of its
//   transactions being those writes, so each refill has to be earned by real writes.
// Draining is still possible in principle (it is a testnet faucet), but it costs on-chain writes
// per refill, not just a request.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { http, isAddress, parseEther, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { checkPow, hourBucket } from "../src/lib/pow.js";

const RPC = "https://rpc.tiramisu.db-chain.testnet.arkiv.network";
export const TOP_UP = parseEther("0.01"); // about five entries with a full size photo, far more without
export const LOW = parseEther("0.003"); // covers one write with the largest photo
export const EXTEND_TOP_UP = parseEther("0.0005"); // a lawyer's throwaway key only pays for extensions (about 0.000025 each)
const BURN = "0x000000000000000000000000000000000000dead";
/** One request per address at a time on this instance, so parallel requests cannot double fund. */
const inFlight = new Set<string>();
const PER_IP_PER_HOUR = 10;
const MIN_WRITES_FOR_REFILL = 3;

const hits = new Map<string, number[]>();
export function allow(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_IP_PER_HOUR) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

/** Pure decision, unit tested: may this address get a top up? */
export function mayFund(balance: bigint, txCount: number, entityWrites: number): { ok: boolean; reason?: string } {
  if (balance >= LOW) return { ok: false, reason: "already has enough" };
  if (txCount === 0) return { ok: true };
  if (entityWrites >= MIN_WRITES_FOR_REFILL && txCount <= entityWrites + 2) return { ok: true };
  return { ok: false, reason: "This journal can be topped up again after it has written a few entries." };
}

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void };

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const key = process.env.FUNDER_PRIVATE_KEY as Hex | undefined;
  if (!key) return res.status(503).json({ error: "Funding is not set up on this deployment." });

  const body = typeof req.body === "string" ? safeJson(req.body) : (req.body as Record<string, unknown> | undefined);
  const raw = body?.address;
  if (typeof raw !== "string" || !isAddress(raw)) return res.status(400).json({ error: "That is not a valid address." });
  const address = getAddress(raw);
  const hour = Number(body?.hour);
  const nonce = Number(body?.nonce);
  const now = hourBucket();
  if (!(hour === now || hour === now - 1) || !checkPow(address, hour, nonce)) return res.status(400).json({ error: "The device check did not pass. Please try again." });

  // The connection address is used only for this in-memory rate limit and is never stored.
  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || "unknown";
  if (!allow(ip)) return res.status(429).json({ error: "Too many requests from this connection. Try again in an hour." });

  const purpose = body?.purpose === "extend" ? "extend" : "write";
  if (inFlight.has(address)) return res.status(429).json({ error: "Already preparing this journal. Wait a moment." });
  inFlight.add(address);
  const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, { retryCount: 1 }) });
  try {
    const [balance, txCount] = await Promise.all([pub.getBalance({ address }), pub.getTransactionCount({ address })]);
    let writes = 0;
    if (txCount > 0 && balance < LOW) {
      // Only real journal entries count: kind=entry, created by this address, owned by the burn address.
      const page = await pub.select({ owner: true }).where([eq("app", "safejournal"), eq("kind", "entry")]).createdBy(address).limit(50).fetch();
      writes = page.entities.filter((e) => String(e.owner).toLowerCase() === BURN).length;
    }
    const decision = purpose === "extend" ? (txCount === 0 && balance < EXTEND_TOP_UP ? { ok: true } : { ok: false, reason: balance >= EXTEND_TOP_UP ? "already has enough" : "Only a fresh key can be funded for extensions." }) : mayFund(balance, txCount, writes);
    if (!decision.ok) return res.status(decision.reason === "already has enough" ? 200 : 403).json(decision.reason === "already has enough" ? { funded: false, reason: decision.reason } : { error: decision.reason });
    const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC), account: privateKeyToAccount(key) });
    const value = purpose === "extend" ? EXTEND_TOP_UP : TOP_UP;
    let txHash: Hex;
    try {
      txHash = await wallet.sendTransaction({ to: address, value });
    } catch (e) {
      // Two top ups at the same moment can collide on the funder's nonce; try once more.
      if (!/nonce/i.test(String((e as Error).message))) throw e;
      txHash = await wallet.sendTransaction({ to: address, value });
    }
    return res.status(200).json({ funded: true, txHash });
  } catch {
    return res.status(502).json({ error: "Could not reach Arkiv to prepare your journal. Try again in a minute." });
  } finally {
    inFlight.delete(address);
  }
}

function safeJson(s: string): Record<string, unknown> | undefined {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return undefined; }
}
