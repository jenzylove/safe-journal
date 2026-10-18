# Arkiv data contract: Safe Journal

Network: Arkiv **Tiramisu** testnet, chain ID `7738577`, RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`, WebSocket `wss://rpc.tiramisu.db-chain.testnet.arkiv.network`. SDK `@arkiv-network/sdk` 0.8.1.

Anyone can build their own reader on this contract without asking us: the entity layout, the encryption format and the key derivation are all documented below, and the standalone reader (`reader/safe-journal-reader.html`) is one file that implements it.

## Who creates entities

A journal is an address derived in the browser from the person's passphrase (section "Keys"). That address is the `$creator` of every entry and photo in the journal. Wallets that create this project's entities on Tiramisu are listed with their roles in [`evidence.json`](evidence.json):

| Role | Address |
|---|---|
| Project funder: tops up new journal addresses with test GLM | `0x659C352eBC66BB7EEb582b3BB1Fe7d8b37f3aBc8` |
| Demo journal: creator of every demo entry (synthetic) | `0x10cf3519F2A71243B3C3091FF97c18a1e32bc8b2` |
| Forger: writes an entry with identical attributes, ignored by the app | `0xFa21E9e5255538f6C4B1828b4125515052d0994b` |
| Supporter: extends a demo entry's lifetime | `0x5f82847C4ae11CAd62939Cd67A2236B0300DB4C9` |

Real journals are created by each person's own derived address; we do not know or list them.

## Entity types

### `entry`

One journal entry.

| Part | Content |
|---|---|
| Attributes (public, queryable) | `app` (str) = `safejournal`, `kind` (str) = `entry`, `v` (i32) = `1` |
| Payload (`application/octet-stream`) | `0x01` format byte, 12 byte IV, AES-256-GCM ciphertext of the padded JSON entry |
| Entity Expiration | 1, 2 or 5 years, **chosen by the person** when writing (`ExpirationTime.fromYears`) |
| Creation flags | `permissionlessExtension: true`, so the person, their lawyer or anyone they trust can extend it |
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
| Attributes | `app` = `safejournal`, `kind` = `photo`, `v` = `1`, `part` (i32) = `0`, `of` (i32) = `1` |
| Payload | `0x01`, IV, AES-256-GCM ciphertext of the image bytes (not padded) |
| Entity Expiration, flags, owner | Same as its entry, set in the same batch |

## Why so few attributes

Attributes are public and queryable, so they hold only what the app must filter on. Time, category, place, names and text are all inside the encrypted payload. Ordering uses `$createdAt` from the chain plus a client-side sort (there is no server-side ordering). The explorer shows three labels and ciphertext.

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
| Look-alike entries from other wallets (shown as "not part of this journal") | `select({ creator }).where([eq("app","safejournal"), eq("kind","entry")]).limit(200)`, then count creators that are not the journal |
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

Expected output (abridged): four entries for `0x10cf3519F2A71243B3C3091FF97c18a1e32bc8b2`, each "owner burn address (cannot be deleted), permissionless extension true", the first with a 3.0 year lifetime (extended by the supporter wallet), and "Same labels, other creators: N (the forged demo entry 0x85a5ac96… is among them: true)".

## Keys (how to build your own reader)

- Seed: `Argon2id(password = NFKC(trim(passphrase)), salt = "safejournal/argon2id/v1", memory = 64 MiB, iterations = 3, parallelism = 1, length = 32)`.
- Signing key: `HKDF-SHA256(seed, info = "safejournal/sign/v1/<i>", 32)` for the first `i` that is a valid secp256k1 scalar (in practice `i = 0`). Its address is the journal.
- Content key: `HKDF-SHA256(seed, info = "safejournal/content/v1", 32)`, used as an AES-256-GCM key.
- Entry plaintext padding: 4 byte big-endian length, then the JSON bytes, zero padded to the next of 1, 2, 4, 8, 16, 32 or 64 KB.
- Lawyer link: `#/lawyer?a=<journal address>&k=<base64url content key>`. The fragment is never sent to any server.

## Lifetimes

| Entity | Lifetime | Why |
|---|---|---|
| `entry` | 1, 2 or 5 years, the person's choice | Evidence has to outlast a court process; the person decides how long it should exist |
| `photo` | Same as its entry | It is part of the entry |
| Extensions | Anyone, any time (`permissionlessExtension`) | A lawyer or advocate can keep a case's evidence alive without holding the journal's key |

## Kept off Arkiv on purpose

The passphrase, every key, every plaintext, the original photo file and its metadata, and anything that identifies the person. The funding endpoint receives only an address and keeps no log of its own. Expired entities leave Arkiv's state, but their ciphertext stays in the chain's transaction history; privacy rests on the key, not on expiry.
