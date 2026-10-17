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
