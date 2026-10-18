// Runs against the real Tiramisu testnet. Skipped unless CHAIN=1 (needs ARKIV_PRIVATE_KEY in .env to
// fund the throwaway journal). All content is synthetic.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseEther } from "viem";
import { deriveKeys, generatePassphrase } from "../lib";
import { walletFor, writeEntry, listEntries, creationTx, blockTime, watchJournal, loadPhoto, publicClient, BURN, countForeignEntries } from "./journal";

const run = process.env.CHAIN === "1" ? describe : describe.skip;

run("journal on Tiramisu", () => {
  it("writes an undeletable entry with a photo, reads it back, proves its time, and sees it live", async () => {
    const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
    const funder = walletFor(env.ARKIV_PRIVATE_KEY as `0x${string}`);
    const keys = await deriveKeys(generatePassphrase());
    const fund = await funder.sendTransaction({ to: keys.address, value: parseEther("0.01") });
    await publicClient.waitForTransactionReceipt({ hash: fund });

    const live: string[] = [];
    const stop = watchJournal(keys.address, (k) => live.push(k));
    await new Promise((r) => setTimeout(r, 2000));

    const photo = new Uint8Array(30_000).map((_, i) => (i * 7) & 255);
    const w = await writeEntry(keys.signingKey, keys.contentKey, { v: 1, happenedAt: "2026-10-16T22:10:00+01:00", category: "threats", text: "Synthetic integration test entry." }, 1, { bytes: photo, mime: "image/jpeg" });

    const items = await listEntries(keys.address, keys.contentKey);
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    expect(it0.entry?.text).toBe("Synthetic integration test entry.");
    expect(it0.owner.toLowerCase()).toBe(BURN.toLowerCase());
    expect(it0.creator.toLowerCase()).toBe(keys.address.toLowerCase());
    expect(it0.permissionlessExtension).toBe(true);
    expect(await creationTx(it0.key, it0.createdAtBlock)).toBe(w.txHash);
    const t = await blockTime(it0.createdAtBlock);
    expect(Math.abs(t.getTime() - Date.now())).toBeLessThan(5 * 60_000);
    const blob = await loadPhoto(it0.entryKey!, it0.entry!.photo!.parts[0] as `0x${string}`, "image/jpeg");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(photo);
    expect(await countForeignEntries(keys.address)).toBeGreaterThanOrEqual(0);

    // selective share: a bundle for this entry opens it without the content key
    const { encodeShare, decodeShare } = await import("../lib");
    const shared = decodeShare(encodeShare([{ entityKey: it0.key, entryKeyRaw: it0.entryKeyRaw! }]));
    const viaShare = await listEntries(keys.address, { shared });
    expect(viaShare[0]?.entry?.text).toBe("Synthetic integration test entry.");
    const sharedPhoto = await loadPhoto(viaShare[0]!.entryKey!, it0.entry!.photo!.parts[0] as `0x${string}`, "image/jpeg");
    expect(new Uint8Array(await sharedPhoto.arrayBuffer())).toEqual(photo);

    const wrong = await deriveKeys(generatePassphrase());
    const asStranger = await listEntries(keys.address, wrong.contentKey);
    expect(asStranger[0]?.unreadable).toBe(true);

    await new Promise((r) => setTimeout(r, 4000));
    stop();
    expect(live).toContain(w.entityKey);
    console.log("journal", keys.address, "entry", w.entityKey, "tx", w.txHash);
  }, 180_000);
});
