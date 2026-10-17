# Friction report

Arkiv surfaces used while building Safe Journal. SDK `@arkiv-network/sdk` 0.8.1, Tiramisu testnet (chain 7738577). Each item: expected, actual, steps to reproduce, what would fix it. Kept while building; entries are added as they happen.

## F1. No event when an entity expires

- **Surface:** TypeScript SDK, `watchEntityEvents`
- **Expected:** a handler for expiry, since Entity Expiration is a core primitive.
- **Actual:** `WatchEntityEventsParameters` in 0.8.1 offers `onEntityCreated`, `onEntityPatched`, `onExpiryExtended`, `onOwnershipTransferred`, `onEntityDeleted` and `onEvent`. The `EntityDeletedEvent` doc comment reads "An entity was deleted by its owner, before its expiry", so expiry emits nothing.
- **Repro:** `npm pack @arkiv-network/sdk@0.8.1`, open `dist/index-*.d.ts`, read `WatchEntityEventsParameters` and `EntityDeletedEvent`.
- **Fix:** an `onEntityExpired` event, or a documented pattern for detecting expiry from the head block.
