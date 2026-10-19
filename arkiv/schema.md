# Arkiv data contract: Safe Journal

Network: Arkiv **Tiramisu** testnet, chain ID `7738577`, RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`, WebSocket `wss://rpc.tiramisu.db-chain.testnet.arkiv.network`. SDK `@arkiv-network/sdk` 0.8.1.

Anyone can build their own reader on this contract without asking us: the entity layout, the encryption format and the key derivation are all documented below, and the standalone reader (`reader/safe-journal-reader.html`) is one file that implements it.

## Who creates entities

A journal is an address derived in the browser from the person's passphrase (section "Keys"). That address is the `$creator` of every entry and photo in the journal. Wallets that create this project's entities on Tiramisu are listed with their roles in [`evidence.json`](evidence.json):

| Role | Address |
|---|---|
| Project funder: tops up new journal addresses with test GLM | `0x659C352eBC66BB7EEb582b3BB1Fe7d8b37f3aBc8` |
| Demo journal: creator of every demo entry (synthetic) | `0x45259EADD9aBa97e0BC51f74ca2B7D2b90d91Fa7` |
| Forger: plants a fake entry labelled as the demo journal's, rejected by the app | `0x32Dc3B17944F8996618dc8d43b2E0dC19339807a` |
| Supporter: keeps a demo entry one more year, as a lawyer would | `0x2d43Fd40b0F1Fd4f2dE7217A3492f3955C49695b` |

Real journals are created by each person's own derived address; we do not know or list them.

## Entity types

### `entry`

One journal entry.

| Part | Content |
|---|---|
| Attributes (public, queryable) | `app` (str) = `safejournal`, `kind` (str) = `entry`, `v` (i32) = `1`, `journal` (str) = the journal address in lower case. `journal` repeats the creator on purpose: it is a label anyone can write, so the lawyer view can show entries that claim a journal but were written by another wallet as rejected |
| Payload (`application/octet-stream`) | Format 2: `0x02`, 12 byte IV, the entry's own 32 byte key wrapped (AES-256-GCM) by the journal's content key, then a sealed body: `0x01`, 12 byte IV, AES-256-GCM ciphertext of the padded JSON entry under the entry key |
| Entity Expiration | 1, 2, 5 or 10 years, **chosen by the person** when writing (`ExpirationTime.fromYears`) |
| Creation flags | `readonly` always (no patches). `permissionlessExtension` **off by default**; on only if the person ticks "Let my lawyer keep this entry longer". With the owner set to the burn address, an entry without the flag lives exactly as long as the person chose |
| Owner after the creating transaction | `0x000000000000000000000000000000000000dEaD` (burn address) |

Plaintext JSON inside the payload:

```json
{ "v": 1, "happenedAt": "2026-10-15T22:05:00.000Z", "category": "threats", "text": "...",
  "photo": { "mime": "image/jpeg", "size": 41236, "sha256": "…", "parts": ["0x…photo entity key"] } }
```

`category` is one of `physical`, `threats`, `financial`, `digital`, `other`. `happenedAt` is the time the person says it happened; the **proven** write time is the entity's `$createdAt` block.

### `photo`

The photo attached to an entry, if any. Redrawn on a canvas in the browser (which drops EXIF and GPS), re-encoded as JPEG at or under 49 KB.

| Part | Content |
|---|---|
| Attributes | `app` = `safejournal`, `kind` = `photo`, `v` = `1`, `part` (i32) = `0`, `of` (i32) = `1`, `journal` |
| Payload | `0x01`, IV, AES-256-GCM ciphertext of the image bytes under its entry's key (not padded) |
| Entity Expiration, flags, owner | Same as its entry, set in the same batch |

## Why so few attributes

Attributes are public and queryable, so they hold only what the app must filter on. Time, category, place, names and text are all inside the encrypted payload. Ordering uses `$createdAt` from the chain plus a client-side sort (there is no server-side ordering). The explorer shows four labels and ciphertext.

## Writes

Every entry is **one `executeBatch` transaction**:

1. `publicClient.predictEntityKeys({ owner: journal, count })` returns the keys and salts the creates will mint.
2. The entry plaintext is encrypted with additional data `safejournal/v1/entry/<entity key>/0` (the photo with `…/photo/<photo key>/0`), so a ciphertext copied into another entity does not decrypt.
3. `executeBatch({ creates: [entry, photo?], ownershipChanges: [{ entityKey, newOwner: BURN }, …] })`: both creates carry their predicted salt; both are handed to the burn address in the same transaction. There is no moment where an entry exists and can be deleted.
4. If the minted key differs from the predicted one (another write from the same key moved the nonce), the app reports a failed write instead of showing a broken entry.

Proven on Tiramisu: tx `0x1d1709cc45869eb366ed01719a095dd9f308daa2a39a25f147339e997f644c9b` (spike) and the four demo entries in `evidence.json`. A delete or patch from the creator afterwards is refused: "entity … is owned by 0x…dEaD, not 0x659C…aBc8".

## Queries the app runs

| Purpose | Query |
|---|---|
| The journal, and the lawyer view | `select({ key, creator, owner, createdAt, expiresAt, creationFlags, payload }).where([eq("app","safejournal"), eq("kind","entry")]).createdBy(journal).limit(100)`, with cursor pagination (`hasNextPage()` / `next()`) |
| Planted entries (shown under "Not from this journal" as rejected) | `select({ key, creator, createdAt, contentType, payload }).where([eq("app","safejournal"), eq("kind","entry"), eq("journal", journal)]).limit(50)`, then keep those whose creator is not the journal |
| Keep an entry longer (lawyer view) | `extendEntity({ entityKey, expires: ExpirationTime.atBlock(expiresAt + one year of blocks) })` from a throwaway key funded for gas; refused by the chain unless the entry was created with `permissionlessExtension` |
| One entry or photo | `getEntity(key)` |
| Proven write time | `getBlock({ blockNumber: entity.createdAt }).timestamp` |
| Creating transaction (entities do not carry it) | `getLogs({ event: EntityCreated, args: { entityKey }, fromBlock: createdAt, toBlock: createdAt })` |
| Live updates | `watchEntityEvents({ onEntityCreated })` over a **WebSocket** transport, no `fromBlock`. Events carry `owner` but no attributes, so the client keeps events whose `owner` is the journal address (the creating owner, before the handoff) and fetches only those |

Trust always comes from `$creator` via `createdBy(journal)`, never from an attribute: anyone can write an entity labelled `app=safejournal, kind=entry`, and the demo's forged entry does exactly that.

## Exact query to reproduce

```bash
git clone https://github.com/jenzylove/safe-journal && cd safe-journal && npm install
node scripts/verify.mjs
```

Expected output (abridged): four entries for `0x45259EADD9aBa97e0BC51f74ca2B7D2b90d91Fa7`, written about two minutes apart, each "owner burn address, readonly true"; one with "extendable false"; the first with a 3.0 year lifetime after another wallet kept it a year longer; "Carry the journal's label: 5. Of those, written by another wallet (planted, rejected by the app): 1"; and "Extension … was sent by 0x2d43… (not the journal: true)".

## Reading it without the SDK

`node scripts/independent-check.mjs` is a second client written only from this document: no Arkiv SDK, no viem, no packages. It sends `arkiv_query` with the journal filter `app = str('safejournal') AND kind = str('entry') AND $creator = addr(<journal>)`, reads each entity with `arkiv_getEntity` (which reports no query cost), takes the write time from `eth_getBlockByNumber` and the creating transaction from `eth_getLogs` with topics `[keccak256("EntityCreated(bytes32,address,uint64,uint8)"), <entity key>]`, then opens the entries with WebCrypto. Pass any share link to open only what it unlocks:

```bash
node scripts/independent-check.mjs "https://safe-journal-seven.vercel.app/#/lawyer?a=0x…&s=…"
```

## Keys (how to build your own reader)

- Normalisation: `NFKC`, trim; if there are two or more words and every word is on the BIP39 English word list, lower case and single spaces (so capitals and extra spaces do not change the journal).
- Seed: `Argon2id(password = normalised passphrase, salt = "safejournal/argon2id/v1", memory = 64 MiB, iterations = 3, parallelism = 1, length = 32)`. The salt is shared by every journal because there is no account to hold a per person salt; new journals therefore start only from six different generated words (about 66 bits).
- Signing key: `HKDF-SHA256(seed, info = "safejournal/sign/v1/<i>", 32)` for the first `i` that is a valid secp256k1 scalar (in practice `i = 0`). Its address is the journal.
- Content key: `HKDF-SHA256(seed, info = "safejournal/content/v1", 32)`, used as an AES-256-GCM key.
- Entry plaintext padding: 4 byte big-endian length, then the JSON bytes, zero padded to the next of 1, 2, 4, 8, 16, 32 or 64 KB.
- Per-entry keys: each entry has a random 32 byte AES-256-GCM key, wrapped by the content key with additional data `safejournal/v2/wrap/<entity key>`. The owner unwraps every entry; a share link carries only the keys of the entries the person chose. Format 1 entries (an early test format, encrypted directly with the content key) still open with the content key.
- Share links (all in the URL fragment, which browsers never send to a server; the lawyer view also removes the key from the address bar as soon as it loads):
  - chosen entries: `#/lawyer?a=<journal address>&s=<base64url bundle>`, where the bundle is, per entry, the 32 byte entity key followed by its 32 byte entry key
  - whole journal: `#/lawyer?a=<journal address>&k=<base64url content key>`
  - proof only: `#/lawyer?a=<journal address>`

## Lifetimes

| Entity | Lifetime | Why |
|---|---|---|
| `entry` | 1, 2, 5 or 10 years, the person's choice | Evidence has to outlast a court process; the person decides how long it should exist, and nobody can shorten it |
| `photo` | Same as its entry | It is part of the entry |
| Extensions | Only entries the person opened to it (`permissionlessExtension`, opt in) | A lawyer or advocate can keep a case's evidence alive without holding the journal's key, but only where the person allowed it |

## Kept off Arkiv on purpose

The passphrase, every key, every plaintext, the original photo file and its metadata, and anything that identifies the person. The funding endpoint receives only an address and a proof of work (`sha256("safejournal-fund|<address>|<hour>|<nonce>")` with 19 leading zero bits, checked statelessly), sends 0.01 test GLM to a brand new address that is below 0.003, refills only an address that has written at least three journal entries (with most of its transactions being those writes), sends 0.0005 to a fresh key that only pays for a lawyer's extensions, and keeps no log of its own. Expired entities leave Arkiv's state, but their ciphertext stays in the chain's transaction history; privacy rests on the key, not on expiry.
