// Passphrase strength. The journal's ciphertext is public forever, so a passphrase has to survive
// offline guessing for years. We only accept passphrases that clear a conservative entropy bar,
// and offer a generated six word passphrase (about 66 bits) as the easy path.
import { english } from "viem/accounts";

export const MIN_BITS = 60;

const COMMON = new Set([
  "password", "passphrase", "iloveyou", "letmein", "qwerty", "123456", "12345678", "abc123",
  "welcome", "monkey", "dragon", "sunshine", "princess", "football", "baseball", "master",
]);

/** Rough, deliberately pessimistic estimate in bits. */
export function estimateBits(passphrase: string): number {
  const p = passphrase.normalize("NFKC").trim();
  if (!p) return 0;
  const words = p.split(/\s+/).filter(Boolean);
  const wordlist = new Set(english);
  // A passphrase made only of wordlist words is scored as words, not characters.
  if (words.length >= 2 && words.every((w) => wordlist.has(w.toLowerCase()))) {
    return words.length * Math.log2(english.length);
  }
  let pool = 0;
  if (/[a-z]/.test(p)) pool += 26;
  if (/[A-Z]/.test(p)) pool += 26;
  if (/[0-9]/.test(p)) pool += 10;
  if (/[^a-zA-Z0-9\s]/.test(p)) pool += 33;
  if (/\s/.test(p)) pool += 1;
  const unique = new Set(p).size;
  // Penalise repetition: count only distinct characters beyond the first few.
  const effectiveLength = Math.min(p.length, unique + Math.floor((p.length - unique) / 3));
  let bits = effectiveLength * Math.log2(Math.max(pool, 2));
  // Common base word with digits or symbols bolted on ("Password123!") is still common.
  const base = p.toLowerCase().replace(/[^a-z]/g, "");
  if (COMMON.has(base) || COMMON.has(p.toLowerCase().replace(/[^a-z0-9]/g, ""))) bits = Math.min(bits, 10);
  return bits;
}

export type StrengthVerdict = { ok: boolean; bits: number; reason?: string };

export function checkPassphrase(passphrase: string): StrengthVerdict {
  const bits = Math.round(estimateBits(passphrase));
  if (passphrase.trim().length < 12) return { ok: false, bits, reason: "Use at least 12 characters, or tap Generate for six words." };
  if (bits < MIN_BITS) return { ok: false, bits, reason: "Too easy to guess. Add more words, or tap Generate." };
  return { ok: true, bits };
}

/** Six random words from the 2048 word list: about 66 bits. */
export function generatePassphrase(words = 6, random: (n: number) => Uint32Array = (n) => crypto.getRandomValues(new Uint32Array(n))): string {
  const r = random(words);
  return Array.from(r, (x) => english[x % english.length]).join(" ");
}
