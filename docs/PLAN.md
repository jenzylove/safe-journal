# Safe Journal: plan

Start: 17 Oct 2026, 23:30 UTC. Submission closes 18 Oct 2026, 22:59 UTC. Stack: Vite + TypeScript static app, `@arkiv-network/sdk` 0.8.x, one Vercel function for funding, Vitest, Playwright for driving the real page.

## Phases

| # | Phase | Done when |
|---|---|---|
| 0 | **Spikes** (section below) | Each has `docs/spikes/<name>.md` with a verdict |
| 1 | Core library, no network: passphrase to keys (Argon2id, HKDF, secp256k1, AES-GCM), entry encode and decode, photo resize, EXIF strip, chunking, passphrase strength check | Unit tests pass, including a known vector round trip |
| 2 | Arkiv layer: write an entry as one batch (create, ownership to burn address, permissionless extension, chosen lifetime), read by `createdBy`, cursor paging, WebSocket watch filtered by owner, extension | Real transactions on Tiramisu for each, linked in `docs/BUILD_LOG.md`; delete and patch from the journal key revert on chain |
| 3 | Funding function on Vercel: one top up per new address, rate limited, address only | A fresh passphrase writes its first entry with no wallet extension |
| 4 | App: open journal, write entry, journal list with both times and lock state, live updates, Leave now, share link, lawyer view with forged entry rejection, printable timeline | Driven end to end in the headless browser on the deployed site |
| 5 | Standalone reader (single HTML file, second host) | Opens the demo journal with the main site offline |
| 6 | `/demo` and `/proof`, synthetic demo journal seeded with real transactions, including one forged entry from a second wallet and one extension from a third | Both pages live, every link resolves on the explorer |
| 7 | No-trace check: storage, cache, IndexedDB and history empty of entry data after close | Automated Playwright check passes |
| 8 | Design pass | Screenshots in light and dark, approved |
| 9 | Release readiness audit, fixes | Findings fixed or listed in Scope and limits |
| 10 | Submission: `/arkiv/schema.md`, `/arkiv/friction.md`, README, Devfolio answers, demo video under 3 minutes, repo public | Checklist ticked from the live app |

## Spikes (needs a spike)

1. **Create plus ownership change plus permissionless extension in one batch.** Can `executeBatch` create an entity and hand its ownership to a burn address atomically, and do delete and patch then revert? (A rival build reports doing this; confirm ourselves.)
2. **Payload and batch size.** Largest entry and photo chunk that go through the public RPC; rival reports say batches over about 20 KB fail with a misleading error. Decides chunk size and whether an entry with photo fits one batch.
3. **Funding a derived address.** Can a funded project wallet send test GLM to a fresh address, and how much does one entry cost in gas?
4. **Lifetime limits.** Longest lifetime accepted (we want up to 5 years), and whether a stranger's extension works on an entity owned by the burn address with the flag set.
5. **Read path without a backend.** `createdBy` query and WebSocket watch from a plain browser page against the public RPC, and how the anonymous read budget behaves (rivals report a silent 30 to 40 minute hang); decides timeouts and the fail closed message.
6. **Argon2id in the browser.** Time on a mid range phone at the chosen settings.

## Known

- Arkiv features and SDK surface (read from the 0.8.1 type definitions): `executeBatch` with `ownershipChanges`, `permissionlessExtension` and `readonly` creation flags, `watchEntityEvents` with `onEntityCreated`, `onExpiryExtended`, `onOwnershipTransferred`, `onEntityDeleted`; no expiry event.
- Rules, gates and rubric: `Arkiv-Network/global-tour-stop-pre-devcon`, frozen 9 Oct.

## Risks

| Risk | Status | Fallback |
|---|---|---|
| Ownership transfer in the creating batch fails | needs a spike | Transfer in a second transaction immediately after create; the window is stated |
| Photo too large for the RPC | needs a spike | Smaller photo, more chunks, several batches with the entry written last |
| Anonymous read budget hangs judges' reads | needs a spike | Fail fast with a clear message; demo journal kept small |
| Faucet cannot be scripted | known | Project wallet funded once through the browser faucet; funding function sends from it |
| Time | known | Order above puts the claims the judges check (batch, ownership, `createdBy`, reader) first |
