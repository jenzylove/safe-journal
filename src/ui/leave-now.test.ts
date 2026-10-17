import { describe, expect, it } from "vitest";
import { LEAVE_URL, createEscapeTracker, leaveNow } from "./leave-now";

describe("escape triple", () => {
  it("fires on the third press within 1.5 seconds", () => {
    let t = 0;
    const press = createEscapeTracker(() => t);
    expect(press()).toBe(false);
    t = 500;
    expect(press()).toBe(false);
    t = 1400;
    expect(press()).toBe(true);
  });

  it("does not fire when presses are spread out", () => {
    let t = 0;
    const press = createEscapeTracker(() => t);
    press();
    t = 1000;
    press();
    t = 2000;
    expect(press()).toBe(false);
  });

  it("leaveNow calls replace with the neutral url", () => {
    const calls: string[] = [];
    leaveNow((u) => calls.push(u));
    expect(calls).toEqual([LEAVE_URL]);
  });
});
