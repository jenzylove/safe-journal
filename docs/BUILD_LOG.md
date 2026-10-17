# Build log

| Date (UTC) | Commit | What now works |
|---|---|---|
| 17 Oct 23:30 | 0ac8df6 | Repo, PRD, plan, licence, friction log |
| 17 Oct 23:45 | 1430d5a | Spikes proven on Tiramisu: batch create plus ownership handoff to `0x…dEaD`, creator delete and patch refused, stranger extension, forged entry filtered by `createdBy`, 100 KB payload, live events over WebSocket |
| 18 Oct 00:46 | next | App scaffold (Vite, TypeScript, Leave now on every screen, routes, standalone reader build) and core library: passphrase to keys (Argon2id 64 MiB, HKDF, secp256k1, AES-256-GCM), strength check with six word generator, padded entry encryption bound to the entity key, photo parts. 12 unit tests, Playwright smoke test |
