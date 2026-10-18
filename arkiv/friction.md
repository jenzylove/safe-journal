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
