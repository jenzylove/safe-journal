// The Arkiv layer. Every entry is written as one atomic batch: the entry (and its photo, if any)
// is created with permissionless extension and the person's chosen lifetime, and in the same
// transaction its ownership is handed to a burn address, so no one can delete or change it.
// Reads always go through createdBy(journal address): trust comes from $creator, never from an
// attribute anyone can write.
import { createPublicClient, createWalletClient, ENTITY_EVENTS_ABI, ExpirationTime } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { http, webSocket, type Hex, getAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { seal, open, aad, sha256Hex, type EntryV1 } from "../lib/entry";
import { sealEntryV2, openEntryAny, newEntryKeyRaw, importEntryKey, type Access } from "../lib/access";

export const RPC_HTTP = "https://rpc.tiramisu.db-chain.testnet.arkiv.network";
export const RPC_WS = "wss://rpc.tiramisu.db-chain.testnet.arkiv.network";
export const EXPLORER = "https://tiramisu.explorer.arkiv.network";
export const BURN: Hex = "0x000000000000000000000000000000000000dEaD";
export const APP = "safejournal";
export const LIFETIMES = [1, 2, 5, 10] as const;
export type LifetimeYears = (typeof LIFETIMES)[number];
/** Largest encrypted photo we put in one batch. 60 KB batches were proven on Tiramisu. */
export const MAX_PHOTO_BYTES = 50_000;
const READ_TIMEOUT_MS = 20_000;

export class ArkivUnavailable extends Error {
  constructor(what: string) { super(`Arkiv is not answering right now (${what}). Nothing was lost; try again in a minute.`); }
}

/** Arkiv limits anonymous reads per connection by cost. Remember when the limit lifts. */
let limitedUntil = 0;
export class ArkivRateLimited extends Error {
  constructor() {
    const mins = Math.max(1, Math.ceil((limitedUntil - Date.now()) / 60_000));
    super(`Arkiv is limiting reads from this connection for about ${mins} ${mins === 1 ? "minute" : "minutes"}. Nothing was lost; please come back then.`);
  }
}
const isRateLimited = (e: unknown) => /ANON_COST_LIMITED|QUOTA_EXCEEDED|429/.test(String((e as Error)?.message ?? e) + String((e as { details?: string })?.details ?? ""));

async function withTimeout<T>(p: Promise<T>, what: string, ms = READ_TIMEOUT_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  if (limitedUntil > Date.now()) throw new ArkivRateLimited();
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new ArkivUnavailable(what)), ms); })]);
  } catch (e) {
    if (isRateLimited(e)) { if (limitedUntil < Date.now()) limitedUntil = Date.now() + 30 * 60_000; throw new ArkivRateLimited(); }
    throw e;
  } finally { clearTimeout(t); }
}

// One retry only: a rate-limited read should fail fast with a clear message, not back off for minutes.
export const publicClient = createPublicClient({
  chain: tiramisu,
  transport: http(RPC_HTTP, {
    retryCount: 1,
    onFetchResponse(res) {
      if (res.status === 429) {
        const secs = Number(res.headers.get("retry-after"));
        limitedUntil = Date.now() + (Number.isFinite(secs) && secs > 0 ? secs * 1000 : 30 * 60_000);
      }
    },
  }),
});

/** Reads are costly on the public RPC, so the same query is answered from memory for a short while. */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}
/** Call after this tab writes, so the next read shows the new entry. */
export function forgetReads(): void { cache.clear(); }

let wsClient: ReturnType<typeof createPublicClient> | undefined;
function ws() { return (wsClient ??= createPublicClient({ chain: tiramisu, transport: webSocket(RPC_WS) })); }

export function walletFor(signingKey: Hex) {
  return createWalletClient({ chain: tiramisu, transport: http(RPC_HTTP), account: privateKeyToAccount(signingKey) });
}

export type WriteResult = { entityKey: Hex; photoKey?: Hex; txHash: Hex };

/** Serialises writes from this tab: predicted keys depend on the account nonce. */
let writing: Promise<unknown> = Promise.resolve();

export function writeEntry(signingKey: Hex, contentKey: CryptoKey, entry: Omit<EntryV1, "photo">, lifetime: LifetimeYears, photo?: { bytes: Uint8Array; mime: string }, extendable = false): Promise<WriteResult> {
  const run = writing.then(() => doWrite(signingKey, contentKey, entry, lifetime, photo, extendable));
  writing = run.catch(() => undefined);
  return run;
}

async function doWrite(signingKey: Hex, contentKey: CryptoKey, entry: Omit<EntryV1, "photo">, lifetime: LifetimeYears, photo?: { bytes: Uint8Array; mime: string }, extendable = false): Promise<WriteResult> {
  if (!LIFETIMES.includes(lifetime)) throw new Error("lifetime must be 1, 2 or 5 years");
  const wallet = walletFor(signingKey);
  const owner = wallet.account.address;
  const count = photo ? 2 : 1;
  const predicted = (await withTimeout(publicClient.predictEntityKeys({ owner, count }), "predicting keys")) as { key: Hex; salt: bigint }[];
  const entryKey = predicted[0]!;
  const photoKey = predicted[1];
  const expires = ExpirationTime.fromYears(lifetime);
  // Only the person decides whether anyone else may extend this entry's lifetime.
  const flags = { permissionlessExtension: extendable };

  const creates = [];
  let full: EntryV1 = { ...entry };
  const entryKeyRaw = newEntryKeyRaw();
  if (photo && photoKey) {
    const sealedPhoto = await seal(await importEntryKey(entryKeyRaw), photo.bytes, aad("photo", photoKey.key, 0), false);
    if (sealedPhoto.length > MAX_PHOTO_BYTES + 64) throw new Error("photo too large after compression");
    full = { ...full, photo: { mime: photo.mime, size: photo.bytes.length, sha256: await sha256Hex(photo.bytes), parts: [photoKey.key] } };
    creates.push({ payload: sealedPhoto, contentType: "application/octet-stream" as const, attributes: { app: APP, kind: "photo", v: 1, part: 0, of: 1 }, expires, flags, salt: photoKey.salt });
  }
  const sealedEntry = await sealEntryV2(contentKey, entryKeyRaw, full, entryKey.key);
  creates.unshift({ payload: sealedEntry, contentType: "application/octet-stream" as const, attributes: { app: APP, kind: "entry", v: 1 }, expires, flags, salt: entryKey.salt });
  const keys = photo && photoKey ? [entryKey.key, photoKey.key] : [entryKey.key];

  const r = await wallet.executeBatch({ creates, ownershipChanges: keys.map((entityKey) => ({ entityKey, newOwner: BURN })) });
  if (r.createdEntities[0]?.toLowerCase() !== entryKey.key.toLowerCase()) {
    // Another write from this key landed first and moved the nonce, so the ciphertext is bound to
    // the wrong key. Surface it rather than pretend it worked.
    throw new Error("entry key moved during write; please write the entry again");
  }
  await publicClient.waitForTransactionReceipt({ hash: r.txHash });
  forgetReads();
  return { entityKey: entryKey.key, photoKey: photoKey?.key, txHash: r.txHash };
}

export type JournalItem = {
  key: Hex;
  entry: EntryV1 | null;
  /** Set when the payload could not be opened with this access. */
  unreadable?: true;
  /** The key that opened this entry (format 2), used for its photo and for sharing it. */
  entryKey?: CryptoKey | null;
  entryKeyRaw?: Uint8Array | null;
  creator: Hex;
  owner: Hex;
  createdAtBlock: bigint;
  expiresAtBlock: bigint;
  permissionlessExtension: boolean;
};

const SELECT = { key: true, creator: true, owner: true, createdAt: true, expiresAt: true, creationFlags: true, payload: true } as const;

/** Every entry written by this journal address, decrypted, oldest first. */
export type AccessArg = Access | CryptoKey | null;
const toAccess = (a: AccessArg): Access => (a && "type" in (a as object) && (a as CryptoKey).algorithm ? { contentKey: a as CryptoKey } : ((a as Access | null) ?? {}));

function rawEntries(address: Hex): Promise<Selected[]> {
  return cached(`entries:${address.toLowerCase()}`, async () => {
    const raw: Selected[] = [];
    let page = await withTimeout(publicClient.select(SELECT).where([eq("app", APP), eq("kind", "entry")]).createdBy(address).limit(100).fetch(), "reading the journal");
    for (;;) {
      raw.push(...(page.entities as unknown as Selected[]));
      if (!page.hasNextPage()) break;
      page = await withTimeout(page.next(), "reading the next page");
    }
    return raw;
  });
}

export async function listEntries(address: Hex, access: AccessArg): Promise<JournalItem[]> {
  const out: JournalItem[] = [];
  for (const e of await rawEntries(address)) out.push(await toItem(e, toAccess(access)));
  return out.sort((a, b) => (a.createdAtBlock < b.createdAtBlock ? -1 : a.createdAtBlock > b.createdAtBlock ? 1 : 0));
}

type Selected = { key: Hex; creator: Hex; owner: Hex; createdAt: bigint; expiresAt: bigint; creationFlags: { permissionlessExtension: boolean }; payload: Uint8Array };

async function toItem(e: Selected, access: Access): Promise<JournalItem> {
  let entry: EntryV1 | null = null;
  let unreadable: true | undefined;
  let entryKey: CryptoKey | null = null;
  let entryKeyRaw: Uint8Array | null = null;
  if (access.contentKey || access.shared?.size) {
    try {
      const r = await openEntryAny(e.payload, e.key, access);
      entry = r.entry; entryKey = r.entryKey ?? access.contentKey ?? null; entryKeyRaw = r.entryKeyRaw;
    } catch { unreadable = true; }
  }
  return { key: e.key, entry, unreadable, entryKey, entryKeyRaw, creator: e.creator, owner: e.owner, createdAtBlock: e.createdAt, expiresAtBlock: e.expiresAt, permissionlessExtension: e.creationFlags.permissionlessExtension };
}

/** How many entries carry our attributes but were written by some other wallet. */
export async function countForeignEntries(address: Hex): Promise<number> {
  const page = await cached("foreign", () => withTimeout(publicClient.select({ creator: true }).where([eq("app", APP), eq("kind", "entry")]).limit(200).fetch(), "counting other entries"));
  return page.entities.filter((e) => e.creator.toLowerCase() !== address.toLowerCase()).length;
}

/** `key` is the entry key that opened the entry (or the content key for format 1 entries). */
export async function loadPhoto(key: CryptoKey, photoKey: Hex, mime: string): Promise<Blob> {
  const e = await withTimeout(publicClient.getEntity(photoKey), "loading the photo");
  const bytes = await open(key, e.payload as Uint8Array, aad("photo", photoKey, 0), false);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
}

const blockTimes = new Map<bigint, Date>();
export async function blockTime(block: bigint): Promise<Date> {
  const hit = blockTimes.get(block);
  if (hit) return hit;
  const b = await withTimeout(publicClient.getBlock({ blockNumber: block }), "reading block time");
  const d = new Date(Number(b.timestamp) * 1000);
  blockTimes.set(block, d);
  return d;
}

const createdEvent = getAbiItem({ abi: ENTITY_EVENTS_ABI, name: "EntityCreated" });
/** Entities do not carry their creating transaction; find it from the EntityCreated log at that block. */
export async function creationTx(entityKey: Hex, block: bigint): Promise<Hex | null> {
  const logs = (await withTimeout(publicClient.getLogs({ event: createdEvent as never, args: { entityKey } as never, fromBlock: block, toBlock: block }), "finding the creating transaction")) as unknown as { transactionHash: Hex }[];
  return logs[0]?.transactionHash ?? null;
}

/** Live: calls back with each new entry this journal writes. Filters chain-wide events by owner locally. */
export function watchJournal(address: Hex, onNew: (key: Hex) => void, onError?: (e: Error) => void): () => void {
  const me = address.toLowerCase();
  return ws().watchEntityEvents({
    onEntityCreated: (e) => { if (e.owner.toLowerCase() === me) onNew(e.entityKey); },
    onError: (e) => onError?.(e),
  });
}

export async function getOne(key: Hex, access: AccessArg): Promise<JournalItem> {
  const e = await withTimeout(publicClient.getEntity(key), "reading the entry");
  return toItem({ key, creator: e.creator as Hex, owner: e.owner as Hex, createdAt: e.createdAt as bigint, expiresAt: e.expiresAt as bigint, creationFlags: e.creationFlags as { permissionlessExtension: boolean }, payload: e.payload as Uint8Array }, toAccess(access));
}

export async function balanceOf(address: Hex): Promise<bigint> {
  return withTimeout(publicClient.getBalance({ address }), "reading the balance");
}

export const explorerEntity = (key: Hex) => `${EXPLORER}/entity/${key}`;
export const explorerTx = (tx: Hex) => `${EXPLORER}/tx/${tx}`;
export const explorerAddress = (a: Hex) => `${EXPLORER}/address/${a}`;

/** One entity, read through the short cache (used by the proof page, which shows the same entity twice). */
export function readEntity(key: Hex) {
  return cached(`entity:${key.toLowerCase()}`, () => withTimeout(publicClient.getEntity(key), "reading an entity"));
}
