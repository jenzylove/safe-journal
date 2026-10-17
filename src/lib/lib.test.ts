import { describe, it, expect } from "vitest";
import { bytesToHex } from "viem";
import { deriveKeys, deriveSeed, signingKeyFromSeed, contentKeyRawFromSeed } from "./keys";
import { checkPassphrase, generatePassphrase, estimateBits } from "./strength";
import { pad, unpad, bucketFor, sealEntry, openEntry, seal, open, aad, splitParts, joinParts, type EntryV1 } from "./entry";

const FAST = { memorySize: 1024, iterations: 1, parallelism: 1 } as const;

describe("keys", () => {
  it("is deterministic and separates signing and content keys", async () => {
    const a = await deriveKeys("correct horse battery staple violin mango", FAST);
    const b = await deriveKeys("correct horse battery staple violin mango", FAST);
    const c = await deriveKeys("correct horse battery staple violin mangos", FAST);
    expect(a.address).toBe(b.address);
    expect(a.address).not.toBe(c.address);
    const seed = await deriveSeed("correct horse battery staple violin mango", FAST);
    expect(signingKeyFromSeed(seed)).not.toBe(bytesToHex(contentKeyRawFromSeed(seed)));
  });
  it("normalises surrounding whitespace", async () => {
    const a = await deriveKeys("  alpha bravo charlie delta echo foxtrot ", FAST);
    const b = await deriveKeys("alpha bravo charlie delta echo foxtrot", FAST);
    expect(a.address).toBe(b.address);
  });
});

describe("strength", () => {
  it("refuses short and common passphrases", () => {
    expect(checkPassphrase("password").ok).toBe(false);
    expect(checkPassphrase("Password123!").ok).toBe(false);
    expect(checkPassphrase("aaaaaaaaaaaaaaaaaaaa").ok).toBe(false);
  });
  it("accepts a generated six word passphrase", () => {
    const p = generatePassphrase();
    expect(p.split(" ")).toHaveLength(6);
    expect(estimateBits(p)).toBeGreaterThanOrEqual(66);
    expect(checkPassphrase(p).ok).toBe(true);
  });
  it("accepts a long mixed passphrase", () => {
    expect(checkPassphrase("Blue kettle on Ikeja road, 4 cups!").ok).toBe(true);
  });
});

describe("entry encoding", () => {
  const entry: EntryV1 = { v: 1, happenedAt: "2026-10-14T21:30:00+01:00", category: "threats", text: "Synthetic test entry." };
  const key = "0x2a8a927c0d2bb815a1916b640f419b23ff2a7cf50ac2e8b435c679c1ac732791";

  it("pads to buckets and unpads exactly", () => {
    const plain = new TextEncoder().encode("hello");
    const p = pad(plain);
    expect(p.length).toBe(1024);
    expect(new TextDecoder().decode(unpad(p))).toBe("hello");
    expect(bucketFor(1025)).toBe(2048);
  });
  it("round trips and hides length within a bucket", async () => {
    const { contentKey } = await deriveKeys("alpha bravo charlie delta echo foxtrot", FAST);
    const short = await sealEntry(contentKey, entry, key);
    const longer = await sealEntry(contentKey, { ...entry, text: "x".repeat(800) }, key);
    expect(short.length).toBe(longer.length);
    expect(await openEntry(contentKey, short, key)).toEqual(entry);
  });
  it("fails when the ciphertext is moved to another entity or the key is wrong", async () => {
    const { contentKey } = await deriveKeys("alpha bravo charlie delta echo foxtrot", FAST);
    const other = await deriveKeys("alpha bravo charlie delta echo golf", FAST);
    const sealed = await sealEntry(contentKey, entry, key);
    await expect(openEntry(contentKey, sealed, key.replace("2a8a", "2a8b"))).rejects.toThrow();
    await expect(openEntry(other.contentKey, sealed, key)).rejects.toThrow();
  });
  it("splits and joins photo parts", async () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) & 255);
    const parts = splitParts(bytes);
    expect(parts.length).toBe(3);
    expect(joinParts(parts)).toEqual(bytes);
    const { contentKey } = await deriveKeys("alpha bravo charlie delta echo foxtrot", FAST);
    const sealed = await seal(contentKey, parts[0], aad("photo", key, 0), false);
    expect(await open(contentKey, sealed, aad("photo", key, 0), false)).toEqual(parts[0]);
  });
});
