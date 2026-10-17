# Safe Journal: PRD

Arkiv Global Tour Stop, 9 to 18 October 2026. Submission closes **18 October 2026, 22:59 UTC**.
Tracks: **Privacy** (lead), **Security**, **Censorship Resistance**.

## 1. Problem

Someone living with an abusive partner is told by every advocate the same thing: write down what happens, with dates, so a lawyer, the police or a court will believe you later. Doing that safely is hard.

1. **The phone gets checked.** Notes, a gallery of injuries, a journal app on the home screen: if the abuser finds them, things can get worse.
2. **The dates get doubted.** "She wrote all of this afterwards." A note's date is whatever the phone says, and an app's timestamp is that company's word.
3. **The app holding the evidence can disappear.** NNEDV's DocuSAFE evidence app stopped working on 1 October 2023; survivors were told to move their data out themselves because NNEDV "cannot help you retrieve it" ([NNEDV](https://nnedv.org/latest_update/nnedv-launches-docusafe-new-evidence-collection-app-survivors/)). DocuSAFE also backed up to cloud accounts an abuser might reach.
4. **The live alternatives keep the evidence on their own servers.** Bright Sky (Vodafone Foundation and Hestia, about 11 countries) stores journal entries off the phone with the operator, or sends them to an email address ([Hestia](https://www.hestia.org/BrightSky), [NZ](https://areyouok.org.nz/get-support/bright-sky)). VictimsVoice (US only, $39.95 a year) says it is court admissible; that claim rests on the company ([coverage](https://www.scarymommy.com/app-domestic-violence-victims-store-court-admissible-evidence/)). An operator can lose, leak, or delete what it holds.

## 2. User and front door

**User:** a person documenting abuse at home, on a phone someone else may check.
**Second reader:** their lawyer or advocate, later, from a link.

**First ten seconds:** the site opens on one calm screen: a passphrase field, "Open journal", a short line on using a private tab, and a **Leave now** button that is visible on every screen (jumps to a neutral site and replaces the history entry). No account, no email, no phone number, nothing installed.

## 3. Full scope

Everything below ships. Nothing is descoped quietly; any cut is listed in section 8 with the reason.

### 3.1 Keys
- Passphrase in, keys out, entirely in the browser. Argon2id (memory hard) stretches the passphrase into a seed. HKDF splits the seed into (a) a secp256k1 signing key, whose address is the journal's `$creator`, and (b) an AES-256-GCM content key.
- Nothing about the passphrase or keys leaves the browser. Weak passphrases are refused with a plain explanation (ciphertext is public forever, so it must survive offline guessing).

### 3.2 Writing an entry
- Fields: what happened (text), when it happened (the person's own date and time), category (physical, threats, financial, digital, other), optional photo.
- The photo is resized and recompressed in the browser, metadata (EXIF, GPS) stripped, then encrypted.
- One Arkiv batch per entry: create the entry entity (and its photo chunks), then hand ownership of each to a burn address in the same batch, so no one can delete or change them afterwards, not the person, not an abuser holding the phone, not us.
- Entities are created with **permissionless extension**, so the person or their lawyer can keep the record alive. The person chooses the entry's lifetime (1, 2 or 5 years), and can extend it later.
- Nothing is stored on the device: no local copy, no cache of plaintext, nothing in browser storage.

### 3.3 The journal
- After the passphrase, the journal lists the person's entries in time order, decrypted in the browser.
- Each entry shows two times side by side: **"you said it happened"** (inside the encrypted payload) and **"written at"**, the Arkiv block time, which no one can backdate. Each has a link to the entity and its creating transaction on the Arkiv explorer.
- Each entry shows its lock state: "Owner: burn address, cannot be deleted" and the lifetime remaining.
- New entries appear live over a WebSocket watch filtered to the person's address, with no refresh.

### 3.4 Sharing with a lawyer
- "Share with a lawyer" produces a read link: the journal address plus the content key in the URL fragment (never sent to any server).
- The lawyer view is read only. It queries Arkiv by `createdBy(journal address)`, so entries written by anyone else, even with identical attributes, are ignored and counted as "not from this journal".
- It shows a printable timeline: each entry with its proven write time, block number, entity key, transaction hash and lock state, so the lawyer can verify each one on the explorer without asking us.

### 3.5 Outliving us
- A standalone reader: one self-contained HTML file in the repo and on a second host, which reads the journal straight from the Arkiv RPC with the passphrase or a share link. If our main site is gone, this still works.

### 3.6 Funding writes
- A passphrase-derived address starts with no test GLM, and the Tiramisu faucet needs a browser wallet. A small funding function tops up a new journal address once with enough for its writes. It sees an address, never content. It is rate limited. Anyone can fund their own address instead.

### 3.7 Judge paths
- `/demo`: a synthetic journal with a published demo passphrase, so judges can open it, read the entries and see the proofs.
- `/proof`: the live state of the demo journal and the project's creator addresses, with explorer links, marked live.
- The demo journal and every seeded entry are synthetic and labelled as such.

## 4. Arkiv data contract (summary; full version in `/arkiv/schema.md`)

| Entity | Attributes (public, queryable) | Payload (encrypted) | Lifetime | Owner after create |
|---|---|---|---|---|
| `entry` | `app` = `safejournal`, `kind` = `entry`, `v` (number) | text, the person's own date and time, category, photo chunk keys, photo hash | 1, 2 or 5 years, person's choice, extendable by anyone | burn address |
| `photo` | `app`, `kind` = `photo`, `v`, `part` (number), `of` (number) | one encrypted chunk of the photo | same as its entry | burn address |

Kept to the minimum on purpose: no time, category, place or name in attributes. Ordering uses `$createdAt` from the chain plus client sort. Queries: `createdBy(addr)` + `app` + `kind`, cursor pagination.

**Kept off Arkiv on purpose:** the passphrase, keys, any plaintext, the photo's original file and metadata, and anything identifying the person. The funding function's logs hold no content.

## 5. How each judging criterion is met

| Criterion | How Safe Journal meets it |
|---|---|
| Why this pillar? (Privacy) | Names who is exposed today (a person whose phone is checked, whose evidence sits on an operator's server) and what changes on day one: nothing on the phone, nothing readable on the explorer, lifetime chosen by the person |
| Why this pillar? (Security) | Trust comes only from `$creator` and block time: the lawyer view filters by `createdBy`, forged entries with matching attributes are shown as rejected, and ownership by a burn address means no one can delete or alter an entry |
| Why this pillar? (Censorship Resistance) | DocuSAFE shut down and its users lost their evidence path. Safe Journal's record outlives our site: the standalone reader reads Arkiv directly |
| Why Arkiv? | Without Arkiv the timestamps are our word and the evidence dies with us. A plain chain can timestamp but cannot hold encrypted records queryable by creator and type, with lifetimes and permissionless extension, without us running an indexer. What stays off Arkiv is listed in section 4 |
| How you use Arkiv | Attributes vs payload (only three public attributes, everything else encrypted), `createdBy` queries with cursor pagination, Entity Expiration per the person's choice, Lifetime Extension by anyone via the permissionless extension flag, ownership transfer to a burn address inside the creating batch, `$creator` surfaced in the lawyer view, WebSocket entity events for live updates, atomic batches for entry plus photo chunks plus ownership changes |
| Friction report | Kept while building in `/arkiv/friction.md`, every item with expected vs actual, versions and repro |

## 6. Claims and how each is proven

| Claim | Proof |
|---|---|
| Nothing is stored on the device | Test: after writing and closing, browser storage, cache and IndexedDB contain no entry data (automated check in the headless browser) |
| The explorer shows nothing readable | Explorer link to a demo entry: three attributes and ciphertext only |
| Entry times can't be backdated | Each entry's write time is `$createdAt` resolved to the block timestamp, linked to the creating transaction |
| Entries can't be deleted or changed | On-chain: owner is the burn address; a delete and a patch attempted from the journal key both revert (transactions linked in `/proof`) |
| Anyone can keep the record alive | A lifetime extension sent from a different wallet succeeds (transaction linked) |
| Forged entries are ignored | An entity with identical attributes from another wallet is written; the lawyer view lists it as "not from this journal" |
| It outlives our site | The standalone reader opens the demo journal with only an Arkiv RPC (shown in the demo with the main site down) |
| The funder sees no content | The funding function's code: it receives an address only |

## 7. What it does not do

- It does not prove an entry is **true**, only **when** it was written and that it was never changed. Courts still weigh corroboration.
- If someone forces the passphrase out of the person, they can **read** the journal (they still cannot delete it). A decoy passphrase is an open question for the owner, not in scope unless decided.
- It cannot protect against spyware already on the phone (a keylogger sees the passphrase).
- Expired entities leave Arkiv's state but their ciphertext stays in chain history; privacy rests on the key, not on expiry.
- A share link cannot be revoked; whoever holds it can read the journal.
- Testnet only: Arkiv has no mainnet yet. All data in this submission is synthetic.

## 8. Cuts

None at the time of writing.

## 9. Sponsor checklist

Becomes `docs/SUBMISSION_CHECKLIST.md`, ticked only from the live app.

**Gates**
- [ ] Public deployment judges can open without asking for access
- [ ] Reproducible: steps plus the exact query produce what we claim
- [ ] Public repo, MIT licence, setup steps in README
- [ ] `/arkiv/schema.md`: entity types, attributes, expiration per type, queries
- [ ] On-chain evidence on Tiramisu: creator wallet addresses listed with roles
- [ ] `/arkiv/friction.md`
- [ ] Demo video, 3 minutes or less
- [ ] Every required Devfolio question answered (18; see the rules checklist)
- [ ] Tracks chosen on Devfolio: Privacy, Security, Censorship Resistance
- [ ] Built 9 to 18 October; pre-existing work: none
- [ ] Evidence survives expiry: creation transactions linked, video shows them
- [ ] No private keys, secrets or real personal data in any entity (synthetic only)

**Pillar asks**
- [ ] Privacy: explorer shows no personal data; few attributes; encrypted payloads; expiry the user controls
- [ ] Security: app shows and filters by `$creator`, never a writable field
- [ ] Censorship Resistance: someone outside the team reads and queries the data from Arkiv without our backend

**SDK and vocabulary**
- [ ] `@arkiv-network/sdk` 0.8.x on Tiramisu (chain 7738577)
- [ ] `watchEntityEvents` over a WebSocket transport, no `fromBlock`
- [ ] Say "Entity Expiration" and "Lifetime Extension", never TTL
- [ ] Repo SHA at the deadline is what is judged; no force push after
- [ ] Deployment stays up until 23 October
