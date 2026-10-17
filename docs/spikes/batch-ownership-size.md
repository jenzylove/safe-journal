# Spike: batch create with ownership handoff, extension, forgery, size and cost

Covers plan spikes 1, 2, 3 and 4. Run 17 Oct 2026, 23:39 to 23:41 UTC, `@arkiv-network/sdk` 0.8.1, Tiramisu (chain 7738577). Script: `spikes/spike1-batch-ownership.mjs`, raw output: `spikes/spike1.out.txt`. Creator wallet A: `0x659C352eBC66BB7EEb582b3BB1Fe7d8b37f3aBc8`. Stranger wallet B: `0x1e7522e08C160d70a287A17f4dDCE6c8aC181092`.

## Questions and answers

| Question | Result |
|---|---|
| Can one batch create an entry plus a photo chunk and hand both to a burn address? | **Yes.** Tx `0x1d1709cc45869eb366ed01719a095dd9f308daa2a39a25f147339e997f644c9b`, block 715313. `predictEntityKeys` (on the **public** client only; the wallet client lacks it) returned keys that matched the created ones. Read back: owner `0x…dEaD`, creator A, flags `permissionlessExtension: true` |
| Can the creator still delete or patch? | **No.** Both refused before broadcast: "entity 0x2a8a…2791 is owned by 0x…dEaD, not 0x659C…aBc8" |
| Can a stranger extend it? | **Yes.** B extended it to `fromYears(6)` in tx block 715321; `expiresAt` moved from 79555313 to 95323321 |
| Is a five year lifetime accepted? | **Yes**, `ExpirationTime.fromYears(5)`. `ExpirationTime.permanent()` is also accepted |
| Does a forged entry with identical attributes get filtered out by `createdBy`? | **Yes.** Query on `app` + `kind` alone returned both creators (A and B). Adding `.createdBy(A)` returned only A's entry |
| Can a funded wallet fund a fresh address? | **Yes.** A sent 0.01 GLM to B, which then paid for two writes |
| Largest single payload through the public RPC | 100 KB succeeded; 127 KB failed with "Execution error without revert data" |
| Batch size | Batches of 2 × 10 KB, 2 × 20 KB and 2 × 30 KB (60 KB total) all succeeded, so the "about 20 KB" limit other builders reported did not reproduce here |
| Cost | About 0.0007 GLM for an entry (2 KB) plus a 15 KB photo chunk with both ownership changes; 100 KB costs 0.0041 GLM; an extension 0.000025 GLM. Gas grows roughly linearly, about 41k gas per KB |

## Verdict

**Proven.** Build on it:
- An entry and its photo chunks are written in **one atomic batch** that also hands them to the burn address. No window where they are deletable.
- Photo chunk size: up to 60 KB per batch is safe; keep each photo at or under about 90 KB after compression, in one or two chunks.
- The funding function gives each new journal 0.05 GLM, enough for about 60 entries with photos.
- The lawyer view must always query with `createdBy(journal address)`; the forged entry from B is the demo's proof.

## Friction found

- `predictEntityKeys` exists on the public client but not the wallet client (logged in `/arkiv/friction.md`).
- A refused delete surfaces as a thrown error before broadcast, so there is no failed transaction to link as on-chain proof. The proof page shows the node's refusal message and the entity's `owner` field instead.
- 127 KB fails with the generic "Execution error without revert data", the same message an unfunded wallet gets.
