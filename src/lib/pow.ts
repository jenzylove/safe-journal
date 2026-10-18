// Proof of work for the funding endpoint. The device spends a couple of seconds finding a nonce so
// that sha256("safejournal-fund|<address>|<hour>|<nonce>") starts with POW_BITS zero bits. The
// server checks it without storing anything, so draining the funder costs real compute per top up
// no matter how many server instances or IP addresses an attacker uses.
import { sha256 } from "@noble/hashes/sha2.js";

export const POW_BITS = 19;

export const hourBucket = (ms = Date.now()) => Math.floor(ms / 3_600_000);

export function powInput(address: string, hour: number, nonce: number): Uint8Array {
  return new TextEncoder().encode(`safejournal-fund|${address.toLowerCase()}|${hour}|${nonce}`);
}

export function leadingZeroBits(d: Uint8Array): number {
  let n = 0;
  for (const b of d) {
    if (b === 0) { n += 8; continue; }
    return n + Math.clz32(b) - 24;
  }
  return n;
}

export function checkPow(address: string, hour: number, nonce: number, bits = POW_BITS): boolean {
  return Number.isSafeInteger(nonce) && nonce >= 0 && leadingZeroBits(sha256(powInput(address, hour, nonce))) >= bits;
}

/** Finds a nonce, yielding to the page every few thousand hashes so the UI stays responsive. */
export async function solvePow(address: string, bits = POW_BITS, hour = hourBucket()): Promise<{ hour: number; nonce: number }> {
  for (let nonce = 0; ; nonce++) {
    if (checkPow(address, hour, nonce, bits)) return { hour, nonce };
    if (nonce % 4096 === 4095) await new Promise((r) => setTimeout(r, 0));
  }
}
