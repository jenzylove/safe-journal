// Per-entry keys (format 2). Every entry gets its own random AES-256-GCM key. The entry key is
// wrapped by the journal's content key and stored with the entry, so the owner opens everything,
// while a share link can carry just the keys of the entries the person chose. Format 1 entries
// (encrypted directly with the content key) still open with the content key.
import { aad, open, seal, validateEntry, type EntryV1 } from "./entry";

const IV = 12;
const WRAPPED = 32 + 16; // key plus GCM tag

export type Access = {
  /** The journal owner's content key: opens every entry. */
  contentKey?: CryptoKey | null;
  /** Keys for individually shared entries, by lowercase entity key. */
  shared?: Map<string, Uint8Array>;
};

const wrapAad = (entityKey: string) => new TextEncoder().encode(`safejournal/v2/wrap/${entityKey.toLowerCase()}`);
const buf = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

export const newEntryKeyRaw = () => crypto.getRandomValues(new Uint8Array(32));
export const importEntryKey = (raw: Uint8Array) => crypto.subtle.importKey("raw", buf(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

/** payload = 0x02 | wrapIV | wrapped entry key | 0x01-format sealed body */
export async function sealEntryV2(contentKey: CryptoKey, entryKeyRaw: Uint8Array, entry: EntryV1, entityKey: string): Promise<Uint8Array> {
  const wrapIv = crypto.getRandomValues(new Uint8Array(IV));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv, additionalData: buf(wrapAad(entityKey)) }, contentKey, buf(entryKeyRaw)));
  const body = await seal(await importEntryKey(entryKeyRaw), new TextEncoder().encode(JSON.stringify(validateEntry(entry))), aad("entry", entityKey));
  const out = new Uint8Array(1 + IV + WRAPPED + body.length);
  out[0] = 2;
  out.set(wrapIv, 1);
  out.set(wrapped, 1 + IV);
  out.set(body, 1 + IV + WRAPPED);
  return out;
}

/** Returns the entry and the key that opened it (null for format 1), or throws if this access cannot open it. */
export async function openEntryAny(payload: Uint8Array, entityKey: string, access: Access): Promise<{ entry: EntryV1; entryKey: CryptoKey | null; entryKeyRaw: Uint8Array | null }> {
  const parse = (plain: Uint8Array) => validateEntry(JSON.parse(new TextDecoder().decode(plain)));
  if (payload[0] === 1) {
    if (!access.contentKey) throw new Error("locked");
    return { entry: parse(await open(access.contentKey, payload, aad("entry", entityKey))), entryKey: null, entryKeyRaw: null };
  }
  if (payload[0] !== 2) throw new Error("unknown format");
  let raw = access.shared?.get(entityKey.toLowerCase()) ?? null;
  if (!raw) {
    if (!access.contentKey) throw new Error("locked");
    const wrapIv = payload.slice(1, 1 + IV);
    const wrapped = payload.slice(1 + IV, 1 + IV + WRAPPED);
    raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: wrapIv, additionalData: buf(wrapAad(entityKey)) }, access.contentKey, wrapped));
  }
  const entryKey = await importEntryKey(raw);
  return { entry: parse(await open(entryKey, payload.slice(1 + IV + WRAPPED), aad("entry", entityKey))), entryKey, entryKeyRaw: raw };
}

/** Share bundle: for each chosen entry, 32 byte entity key followed by its 32 byte entry key. */
export function encodeShare(pairs: { entityKey: string; entryKeyRaw: Uint8Array }[]): Uint8Array {
  const out = new Uint8Array(pairs.length * 64);
  pairs.forEach((p, i) => {
    const k = p.entityKey.slice(2);
    for (let j = 0; j < 32; j++) out[i * 64 + j] = parseInt(k.slice(j * 2, j * 2 + 2), 16);
    out.set(p.entryKeyRaw, i * 64 + 32);
  });
  return out;
}

export function decodeShare(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length % 64) throw new Error("bad share link");
  const m = new Map<string, Uint8Array>();
  for (let i = 0; i < bytes.length; i += 64) {
    const key = "0x" + Array.from(bytes.slice(i, i + 32), (b) => b.toString(16).padStart(2, "0")).join("");
    m.set(key, bytes.slice(i + 32, i + 64));
  }
  return m;
}
