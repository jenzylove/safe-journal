# Spike: live updates over WebSocket

Plan spike 5 (live part). Run 17 Oct 2026, 23:43 UTC, SDK 0.8.1, Tiramisu. Script `spikes/spike5-live-events.mjs`, output `spikes/spike5.out.txt`.

| Question | Result |
|---|---|
| Does `watchEntityEvents` over `webSocket()` with no `fromBlock` deliver events? | **Yes.** 31 chain-wide events in about 26 seconds (about 1.2 per second on the shared testnet) |
| What does a create event carry? | `type, blockNumber, transactionHash, logIndex, entityKey, owner, expiresAt, creationFlags`. No attributes, no creator field |
| Can we spot our own entries without extra reads? | **Yes.** `owner` on `EntityCreated` is the creating wallet (the handoff to the burn address comes as a separate `OwnershipTransferred` event in the same transaction), so the client filters on `owner == journal address` locally |
| Latency | Our create event arrived 5.2 s after sending, before `createEntity` itself returned (7.8 s) |

**Verdict: proven.** The journal and lawyer views watch over WSS, filter `EntityCreated` by owner locally, then fetch only that one entity. No polling, no read per foreign event.

**Still open:** the anonymous read budget (other builders report a silent 30 to 40 minute hang once it runs out). Reads will have a hard timeout and a plain "Arkiv is not answering right now" message instead of hanging; tested in the browser in phase 4.
