import { describe, it, expect } from "vitest";
import handler, { allow } from "./fund";
import { solvePow, checkPow, hourBucket } from "../src/lib/pow";

function call(body: unknown, method = "POST", ip = "1.2.3.4") {
  let status = 0; let json: unknown;
  const res = { status: (n: number) => { status = n; return res; }, json: (b: unknown) => { json = b; }, setHeader: () => {} };
  return handler({ method, body, headers: { "x-forwarded-for": ip } }, res).then(() => ({ status, json }));
}

describe("fund endpoint", () => {
  it("rejects non POST and bad addresses", async () => {
    process.env.FUNDER_PRIVATE_KEY = "0x" + "11".repeat(32);
    expect((await call({}, "GET")).status).toBe(405);
    expect((await call({ address: "nope" })).status).toBe(400);
  });
  it("refuses requests without a valid device check", async () => {
    process.env.FUNDER_PRIVATE_KEY = "0x" + "11".repeat(32);
    expect((await call({ address: "0x000000000000000000000000000000000000dEaD", hour: hourBucket(), nonce: 1 })).status).toBe(400);
    const solved = await solvePow("0x000000000000000000000000000000000000dEaD", 8);
    expect(checkPow("0x000000000000000000000000000000000000dEaD", solved.hour, solved.nonce, 8)).toBe(true);
    expect(checkPow("0x000000000000000000000000000000000000dEaD", solved.hour - 5, solved.nonce, 8)).toBe(false);
  });
  it("refuses when not configured", async () => {
    delete process.env.FUNDER_PRIVATE_KEY;
    expect((await call({ address: "0x000000000000000000000000000000000000dEaD" })).status).toBe(503);
  });
  it("rate limits per connection", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) expect(allow("9.9.9.9", now + i)).toBe(true);
    expect(allow("9.9.9.9", now + 10)).toBe(false);
    expect(allow("9.9.9.9", now + 3_600_001)).toBe(true);
  });
});

import { mayFund, LOW } from "./fund";
describe("who may be topped up", () => {
  it("funds a brand new address once, then only after real writes", () => {
    expect(mayFund(0n, 0, 0).ok).toBe(true);
    expect(mayFund(LOW, 0, 0).ok).toBe(false);
    expect(mayFund(0n, 1, 0).ok).toBe(false); // spent its GLM elsewhere, replays the proof: nothing
    expect(mayFund(0n, 4, 3).ok).toBe(true); // wrote three entries, ran low
    expect(mayFund(0n, 9, 3).ok).toBe(false); // most of its transactions are not writes
  });
});
