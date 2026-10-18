// Passphrase in, keys out, entirely in the browser.
//
// Argon2id stretches the passphrase into a 32 byte seed. HKDF splits the seed into two keys that
// never share material: a secp256k1 signing key (its address is the journal's $creator on Arkiv)
// and an AES-256-GCM content key. Nothing here touches the network or storage.
import { argon2id } from "hash-wasm";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { privateKeyToAccount, english } from "viem/accounts";
import { bytesToHex, type Hex } from "viem";

// One app-wide salt: there is no account to hang a per-user salt on, so the passphrase alone must
// carry the entropy. That is why weak passphrases are refused (see strength.ts).
const utf8 = (s: string) => new TextEncoder().encode(s);
const ARGON_SALT = new TextEncoder().encode("safejournal/argon2id/v1");
export type ArgonParams = { memorySize: number; iterations: number; parallelism: number };
export const ARGON_PARAMS: ArgonParams = { memorySize: 65536, iterations: 3, parallelism: 1 }; // 64 MiB

export type JournalKeys = {
  address: Hex;
  signingKey: Hex;
  contentKey: CryptoKey;
  /** Raw content key, only for building a share link. Never stored. */
  contentKeyRaw: Uint8Array;
};

const WORDS = new Set(english);
/**
 * Word-list passphrases (the six words the app generates) ignore capitals and extra spaces, so
 * "Term  Canoe raw" opens the same journal as "term canoe raw". Anything else is used as typed
 * (after Unicode normalisation and trimming the ends).
 */
export function normalizePassphrase(passphrase: string): string {
  const base = passphrase.normalize("NFKC").trim();
  const words = base.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every((w) => WORDS.has(w))) return words.join(" ");
  return base;
}

/** Positions (1 based) of words that are not on the word list, when the passphrase looks like one. */
export function unknownWords(passphrase: string): number[] {
  const words = passphrase.normalize("NFKC").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length !== 6) return [];
  const bad = words.map((w, i) => (WORDS.has(w) ? 0 : i + 1)).filter(Boolean);
  return bad.length <= 2 ? bad : [];
}

export async function deriveSeed(passphrase: string, params = ARGON_PARAMS): Promise<Uint8Array> {
  const normalized = normalizePassphrase(passphrase);
  return argon2id({ password: normalized, salt: ARGON_SALT, ...params, hashLength: 32, outputType: "binary" });
}

export function signingKeyFromSeed(seed: Uint8Array): Hex {
  // Retry with a counter in the rare case the 32 bytes are not a valid secp256k1 scalar.
  for (let i = 0; i < 256; i++) {
    const candidate = hkdf(sha256, seed, undefined, utf8(`safejournal/sign/v1/${i}`), 32);
    if (secp256k1.utils.isValidSecretKey(candidate)) return bytesToHex(candidate);
  }
  throw new Error("could not derive a signing key");
}

export function contentKeyRawFromSeed(seed: Uint8Array): Uint8Array {
  return hkdf(sha256, seed, undefined, utf8("safejournal/content/v1"), 32);
}

export async function importContentKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as Uint8Array<ArrayBuffer>, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function deriveKeys(passphrase: string, params = ARGON_PARAMS): Promise<JournalKeys> {
  const seed = await deriveSeed(passphrase, params);
  const signingKey = signingKeyFromSeed(seed);
  const contentKeyRaw = contentKeyRawFromSeed(seed);
  seed.fill(0);
  return {
    address: privateKeyToAccount(signingKey).address,
    signingKey,
    contentKey: await importContentKey(contentKeyRaw),
    contentKeyRaw,
  };
}
