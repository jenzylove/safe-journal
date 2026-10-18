# Friction report

Arkiv surfaces used while building Safe Journal. SDK `@arkiv-network/sdk` 0.8.1, Tiramisu testnet (chain 7738577). Each item: expected, actual, steps to reproduce, what would fix it. Kept while building; entries are added as they happen.

## F1. No event when an entity expires

- **Surface:** TypeScript SDK, `watchEntityEvents`
- **Expected:** a handler for expiry, since Entity Expiration is a core primitive.
- **Actual:** `WatchEntityEventsParameters` in 0.8.1 offers `onEntityCreated`, `onEntityPatched`, `onExpiryExtended`, `onOwnershipTransferred`, `onEntityDeleted` and `onEvent`. The `EntityDeletedEvent` doc comment reads "An entity was deleted by its owner, before its expiry", so expiry emits nothing.
- **Repro:** `npm pack @arkiv-network/sdk@0.8.1`, open `dist/index-*.d.ts`, read `WatchEntityEventsParameters` and `EntityDeletedEvent`.
- **Fix:** an `onEntityExpired` event, or a documented pattern for detecting expiry from the head block.

## F2. `predictEntityKeys` is on the public client, not the wallet client

- **Surface:** TypeScript SDK
- **Expected:** the wallet client, which signs the batch, can predict the keys its own batch will mint (the doc comment's example calls `client.predictEntityKeys` next to `client.executeBatch`).
- **Actual:** `typeof walletClient.predictEntityKeys` is `undefined`; `typeof publicClient.predictEntityKeys` is `function`. Calling it on the public client with `owner: account.address` returned keys that matched the batch exactly.
- **Repro:** SDK 0.8.1, `createWalletClient({ chain: tiramisu, transport: http(), account })`, log `typeof client.predictEntityKeys`. Script: `spikes/spike1-batch-ownership.mjs`.
- **Fix:** expose it on the wallet client too, or change the doc example to use the public client.

## F3. A 127 KB payload fails with the same message as an empty wallet

- **Surface:** public RPC, `createEntity`
- **Expected:** a payload under `MAX_PAYLOAD_BYTES` is accepted, or a size error names the limit.
- **Actual:** 100 KB succeeded (4,122,020 gas, block 715339); 127 KB failed with "Transaction failed: Execution error without revert data", the exact message an unfunded wallet gets.
- **Repro:** SDK 0.8.1, Tiramisu, funded wallet, `createEntity({ payload: randomBytes(127 * 1024), ... })`. Script and output in `spikes/`.
- **Fix:** a size specific error from the node or the SDK, and the public RPC's real payload ceiling in the docs.

## F4. Tested path that worked: create plus ownership handoff in one batch

- **Surface:** `executeBatch` with `creates` and `ownershipChanges`, `permissionlessExtension` flag
- **Expected:** one transaction creates two entities and hands both to `0x…dEaD`; afterwards the creator cannot delete or patch, a stranger can extend.
- **Actual:** exactly that. Tx `0x1d1709cc45869eb366ed01719a095dd9f308daa2a39a25f147339e997f644c9b`. Delete and patch from the creator were refused with a clear message naming the owner. A second wallet's `extendEntity` succeeded.
- **Repro:** `node spikes/spike1-batch-ownership.mjs` with a funded `ARKIV_PRIVATE_KEY` in `.env`.

## F5. Tested path that worked: WebSocket entity events

- **Surface:** `watchEntityEvents` over `webSocket()`, no `fromBlock`
- **Expected:** a real socket, not polling.
- **Actual:** events arrived continuously; our create event arrived 5.2 s after sending, before `createEntity` resolved (7.8 s). Events carry `owner` but no attributes and no creator, so filtering is by owner.
- **Repro:** `node spikes/spike5-live-events.mjs`.

## F6. An entity does not tell you which transaction created it

- **Surface:** `getEntity`, `select()` (SDK 0.8.1)
- **Expected:** a `createdTx` (or similar) field next to `createdAt`, since "show the creating transaction" is how a judge, a lawyer or an auditor checks a record.
- **Actual:** entities carry `createdAt` (a block number) only. We recover the hash with `getLogs({ event: EntityCreated, args: { entityKey }, fromBlock: createdAt, toBlock: createdAt })`, using `ENTITY_EVENTS_ABI` from the SDK and no contract address. It works (the integration test asserts the recovered hash equals the batch's `txHash`), but it is one extra RPC call per entry, which adds up in a long timeline.
- **Repro:** `CHAIN=1 npx vitest run src/arkiv/journal.chain.test.ts`; see `creationTx` in `src/arkiv/journal.ts`.
- **Fix:** return the creating transaction hash on the entity, or document the `getLogs` pattern next to `createdAt`.

## F7. Refused writes leave no on-chain trace to point at

- **Surface:** wallet client `deleteEntity` / `patchEntity` against an entity owned by someone else
- **Expected:** either a reverted transaction (which a product could link to as proof that deletion is impossible) or a documented reason why not.
- **Actual:** the SDK refuses before broadcasting, with a clear message ("entity 0x2a8a…2791 is owned by 0x…dEaD, not 0x659C…aBc8"). Good for users, but there is no transaction hash to show; our proof page shows the `owner` field instead.
- **Repro:** `node spikes/spike1-batch-ownership.mjs` (lines "delete from creator", "patch from creator").
- **Fix:** none needed for safety; a docs line on "how to prove an entity can't be deleted" (owner field plus flags) would help builders.

## F8. `getEntity` attributes come back as a typed map, not the shape you wrote

- **Surface:** `getEntity(key).attributes`
- **Expected:** the same shape passed at create time (`{ app: "safejournal", v: 1 }`).
- **Actual:** `{ app: { type: "str", value: "safejournal" }, kind: { type: "str", value: "entry" }, v: { type: "i32", value: 1 } }`. Our first proof page code assumed an array and failed to typecheck.
- **Repro:** `getEntity("0x7349771437ee9fba3aef2f3fe823453256a27074690d3b080dd0489c17766d25")` on Tiramisu, log `attributes`.
- **Fix:** a short "reading attributes back" example in the README.

## F9. Tested path that worked: browser-only writes from a passphrase-derived key

- **Surface:** wallet client over HTTP in Chromium, `executeBatch`, `predictEntityKeys`
- **Expected:** a key that only ever exists in a browser tab can write, read and watch without any server of ours in the data path.
- **Actual:** on production, a fresh passphrase was funded with 0.02 GLM by our endpoint, wrote an entry plus photo in one batch (10.6 s from tap to proven time), read it back decrypted, and received it over the WebSocket watch. The page left nothing in localStorage, sessionStorage, IndexedDB, Cache Storage or cookies.
- **Repro:** open https://safe-journal-seven.vercel.app in a private window, Generate, Open journal, write an entry with a photo.

## F10. The anonymous read budget locks a connection out for about 30 minutes, and through viem it first looks like a hang

- **Surface:** public JSON-RPC (`arkiv_query`), TypeScript SDK over viem `http()`
- **Versions:** SDK 0.8.1, viem 2.x, Tiramisu, 18 Oct 2026
- **Expected:** a documented per connection budget, and a query that fails fast with a clear "budget used, resets in N minutes" error.
- **Actual:** after a few hours of normal end to end testing from one connection (each test opens journals, lists entries, renders the proof page), every `arkiv_query` returned `429` with body `ANON_COST_LIMITED` and `retry-after: 1952` (seconds), then 470 a little later. `eth_blockNumber` still answered `200`. With viem's default retries the first symptom in the app was a screen stuck on "Reading the journal" rather than an error.
- **Repro:** `curl -s -D - -X POST https://rpc.tiramisu.db-chain.testnet.arkiv.network -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["app = \"safejournal\"",{"resultsPerPage":"0x1"}]}'` repeated from one connection until the budget is spent; read `retry-after`.
- **What we did:** `retryCount: 1`, an `onFetchResponse` hook that reads `retry-after`, a 60 second in tab cache of identical queries, and a plain "Arkiv is limiting reads from this connection for about N minutes" message (`src/arkiv/journal.ts`).
- **Fix:** document the budget and the cost of one query next to the RPC URL, and have the SDK throw a typed rate limit error carrying `retry-after`.

## F11. The faucet can only fund the wallet connected in a browser

- **Surface:** Hub faucet (`hub.arkiv.network/faucet`)
- **Expected:** fund an address that only exists inside an app, the way most testnet faucets take a pasted address.
- **Actual:** the faucet needs a connected wallet and a Sign In With Ethereum signature, then a human check. A journal key derived from a passphrase inside a browser tab cannot do that, so the app needs its own funding endpoint, which puts a server back in the write path. Our own first claim also landed in the connected MetaMask account instead of the address we meant, because the "Send to" field was left empty; the GLM then had to be sent on manually.
- **Repro:** open the faucet with no wallet extension; then with one, claim without filling "Send to".
- **Fix:** a paste an address mode (with the same human check), or sponsored writes.

## F12. Expiry removes an entity from state but not its payload from chain history

- **Surface:** Entity Expiration (docs)
- **Expected:** a clear note that expired payloads remain readable in transaction calldata, because privacy designs depend on it.
- **Actual:** the docs describe expiry as data going away. The creating transaction still carries the payload, which the hackathon's own "evidence that survives expiry" gate relies on. We state it in our schema and threat model and never rely on expiry for privacy.
- **Fix:** one sentence in the Entity Expiration docs.

## F13. `readonly` alone does not stop the owner deleting; we combine it with a burn address owner

- **Surface:** creation flags
- **Expected:** a flag that makes an entity permanent until expiry.
- **Actual:** `readonly` stops patches, but the owner can still delete. To make entries undeletable we hand ownership to `0x…dEaD` in the creating batch and set `readonly` too (spike 6: both flags plus the handoff in one batch, tx `0x947f3d957ba7a23db88edeb8c8bd0b923b35012175da2c88bcb72d31a69a5e67`; a stranger could still extend it because `permissionlessExtension` was set). Other builders report the same surprise.
- **Repro:** `node spikes/spike6-readonly.mjs`.
- **Fix:** document the pattern, or add an "undeletable" flag.

## F14. Entity events carry no creator and no attributes

- **Surface:** `watchEntityEvents`
- **Expected:** enough on the event to decide whether it matters without a read.
- **Actual:** `EntityCreated` carries `owner` but not `creator` or attributes. Because we hand entries to the burn address in the creating batch, we rely on `owner` on the create event still being the journal (the handoff arrives as a separate `OwnershipTransferred` event), then fetch only matching entities. Without that ordering detail a live view would need one read per event chain wide.
- **Repro:** `node spikes/spike5-live-events.mjs` and look at the event fields.
- **Fix:** add `creator` (and optionally attributes) to `EntityCreated`.
