import { describe, it, expect } from "vitest";
import handler, { allow } from "./fund";

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
  it("refuses when not configured", async () => {
    delete process.env.FUNDER_PRIVATE_KEY;
    expect((await call({ address: "0x000000000000000000000000000000000000dEaD" })).status).toBe(503);
  });
  it("rate limits per connection", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(allow("9.9.9.9", now + i)).toBe(true);
    expect(allow("9.9.9.9", now + 10)).toBe(false);
    expect(allow("9.9.9.9", now + 3_600_001)).toBe(true);
  });
});
