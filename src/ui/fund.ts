// Makes sure a journal address can pay for its next write: if it is low, solve the device check and
// ask the funding endpoint for a top up, then wait for it to arrive. Shared by every write path.
import type { Hex } from "viem";
import { balanceOf } from "../arkiv/journal";
import { solvePow } from "../lib/pow";

/** An extension costs about 0.000025 GLM. */
export const EXTEND_BALANCE = 100_000_000_000_000n; // 0.0001 GLM
export const MIN_BALANCE = 3_000_000_000_000_000n; // 0.003 GLM, enough for one write with the largest photo
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function ensureFunded(address: Hex, say: (msg: string) => void, purpose: "write" | "extend" = "write"): Promise<void> {
  const need = purpose === "extend" ? EXTEND_BALANCE : MIN_BALANCE;
  if ((await balanceOf(address)) >= need) return;
  say("Preparing your journal...");
  const { hour, nonce } = await solvePow(address);
  const res = await fetch("/api/fund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, hour, nonce, purpose }),
  });
  let data: { error?: string } = {};
  try { data = (await res.json()) as { error?: string }; } catch { /* no body */ }
  if (!res.ok || data.error) throw new Error(data.error ?? "Could not prepare your journal. Please try again later.");
  for (let i = 0; i < 20; i++) {
    if ((await balanceOf(address)) >= need) return;
    await sleep(3000);
  }
  throw new Error("Preparing your journal is taking longer than expected. Nothing was written. Please try again in a minute.");
}
