// Entry encoding. Everything a person writes is encrypted with AES-256-GCM before it leaves the
// browser. Plaintext is padded to a size bucket so the ciphertext length does not hint at how much
// was written. The additional data binds each ciphertext to the entity key it is stored under, so a
// ciphertext copied into another entity fails to decrypt.

export const CATEGORIES = ["physical", "threats", "financial", "digital", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export type PhotoRef = { mime: string; size: number; sha256: string; parts: string[] };

export type EntryV1 = {
  v: 1;
  /** When it happened, as the person tells it (ISO 8601). Proven write time comes from the chain. */
  happenedAt: string;
  category: Category;
  text: string;
  photo?: PhotoRef;
};

const FORMAT = 1;
const IV_BYTES = 12;
const BUCKETS = [1024, 2048, 4096, 8192, 16384, 32768, 65536];

export function bucketFor(n: number): number {
  for (const b of BUCKETS) if (n <= b) return b;
  return Math.ceil(n / 65536) * 65536;
}

/** Length prefixed, zero padded to the next bucket. */
export function pad(plain: Uint8Array): Uint8Array {
  const total = bucketFor(plain.length + 4);
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, plain.length);
  out.set(plain, 4);
  return out;
}

export function unpad(padded: Uint8Array): Uint8Array {
  const len = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0);
  if (len > padded.length - 4) throw new Error("bad padding");
  return padded.slice(4, 4 + len);
}

export function aad(kind: "entry" | "photo", entityKey: string, part = 0): Uint8Array {
  return new TextEncoder().encode(`safejournal/v1/${kind}/${entityKey.toLowerCase()}/${part}`);
}

export async function seal(key: CryptoKey, plain: Uint8Array, additionalData: Uint8Array, padIt = true): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const body = padIt ? pad(plain) : plain;
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: additionalData as Uint8Array<ArrayBuffer> }, key, body as Uint8Array<ArrayBuffer>));
  const out = new Uint8Array(1 + IV_BYTES + ct.length);
  out[0] = FORMAT;
  out.set(iv, 1);
  out.set(ct, 1 + IV_BYTES);
  return out;
}

export async function open(key: CryptoKey, sealed: Uint8Array, additionalData: Uint8Array, padded = true): Promise<Uint8Array> {
  if (sealed[0] !== FORMAT) throw new Error("unknown format");
  const iv = sealed.slice(1, 1 + IV_BYTES);
  const ct = sealed.slice(1 + IV_BYTES);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: additionalData as Uint8Array<ArrayBuffer> }, key, ct));
  return padded ? unpad(plain) : plain;
}

export function validateEntry(e: unknown): EntryV1 {
  const x = e as EntryV1;
  if (!x || x.v !== 1) throw new Error("not a v1 entry");
  if (typeof x.text !== "string" || typeof x.happenedAt !== "string") throw new Error("bad entry fields");
  if (!CATEGORIES.includes(x.category)) throw new Error("bad category");
  return x;
}

export async function sealEntry(key: CryptoKey, entry: EntryV1, entityKey: string): Promise<Uint8Array> {
  return seal(key, new TextEncoder().encode(JSON.stringify(validateEntry(entry))), aad("entry", entityKey));
}

export async function openEntry(key: CryptoKey, sealed: Uint8Array, entityKey: string): Promise<EntryV1> {
  const plain = await open(key, sealed, aad("entry", entityKey));
  return validateEntry(JSON.parse(new TextDecoder().decode(plain)));
}

/** Photo parts: at most 60 KB of ciphertext per Arkiv batch was proven safe (docs/spikes). */
export const PHOTO_PART_BYTES = 45_000;

export function splitParts(bytes: Uint8Array, size = PHOTO_PART_BYTES): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) parts.push(bytes.slice(i, i + size));
  return parts.length ? parts : [new Uint8Array(0)];
}

export function joinParts(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}
