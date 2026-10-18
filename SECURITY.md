# Security

Safe Journal holds no keys and no plaintext on any server. Keys are derived in the browser from the passphrase (Argon2id, 64 MiB) and kept only in memory; entries are encrypted with AES-256-GCM before they leave the browser. The design is documented in [arkiv/schema.md](arkiv/schema.md).

If you find a way to read, alter, delete or link someone's journal, or to drain the funding endpoint cheaply, please open a private security advisory on this repository instead of a public issue. All data in this repository and the demo is synthetic; never test with real personal information.
