import { describe, expect, it } from "vitest";
import { HIDDEN_LIMIT_MS, IDLE_LIMIT_MS, lockReason } from "./lock";

describe("auto lock", () => {
  it("stays open while the page is visible and in use", () => {
    expect(lockReason({ now: 1_000_000, hiddenSince: null, lastInput: 999_000 })).toBeNull();
  });

  it("locks after more than two minutes hidden", () => {
    const now = 10_000_000;
    expect(lockReason({ now, hiddenSince: now - HIDDEN_LIMIT_MS, lastInput: now })).toBeNull();
    expect(lockReason({ now, hiddenSince: now - HIDDEN_LIMIT_MS - 1, lastInput: now })).toBe("hidden");
  });

  it("locks after more than fifteen minutes without input", () => {
    const now = 100_000_000;
    expect(lockReason({ now, hiddenSince: null, lastInput: now - IDLE_LIMIT_MS })).toBeNull();
    expect(lockReason({ now, hiddenSince: null, lastInput: now - IDLE_LIMIT_MS - 1 })).toBe("idle");
  });

  it("a short look away does not lock", () => {
    const now = 5_000_000;
    expect(lockReason({ now, hiddenSince: now - 30_000, lastInput: now - 60_000 })).toBeNull();
  });
});
