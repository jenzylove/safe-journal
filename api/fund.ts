// Funding endpoint. A passphrase-derived journal address starts with no test GLM, and the Tiramisu
// faucet needs a browser wallet, so this sends a journal a small amount when it runs low. It
// receives an address and a proof of work, nothing else: no content, no passphrase, no key.
// Abuse costs compute: every top up needs a fresh proof of work bound to that address and hour.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http, isAddress, parseEther, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { checkPow, hourBucket } from "../src/lib/pow.js";

const RPC = "https://rpc.tiramisu.db-chain.testnet.arkiv.network";
export const TOP_UP = parseEther("0.005"); // about six entries with photos, or fifty without
export const LOW = parseEther("0.001");
const PER_IP_PER_HOUR = 10;

const hits = new Map<string, number[]>();
export function allow(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_IP_PER_HOUR) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  return true;
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

  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || "unknown";
  if (!allow(ip)) return res.status(429).json({ error: "Too many requests from this connection. Try again in an hour." });

  const pub = createPublicClient({ chain: tiramisu, transport: http(RPC) });
  try {
    const balance = await pub.getBalance({ address });
    if (balance >= LOW) return res.status(200).json({ funded: false, reason: "already has enough" });
    const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC), account: privateKeyToAccount(key) });
    const txHash = await wallet.sendTransaction({ to: address, value: TOP_UP });
    return res.status(200).json({ funded: true, txHash });
  } catch {
    return res.status(502).json({ error: "Could not reach Arkiv to prepare your journal. Try again in a minute." });
  }
}

function safeJson(s: string): Record<string, unknown> | undefined {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return undefined; }
}
