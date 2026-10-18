import { expect, test } from "@playwright/test";

const routes: Array<[string, string]> = [
  ["#/", "Write it down. Keep it safe."],
  ["#/open", "Open journal"],
  ["#/start", "Start your journal"],
  ["#/decoy", "Open journal"], // no session: back to the open screen
  ["#/write", "Open journal"],
  ["#/share", "Open journal"], // share.ts redirects to the open screen without a session
  ["#/journal", "Open journal"],
  ["#/lawyer", "Lawyer view"],
  ["#/demo", "Demo journal"],
  ["#/proof", "Proof"],
];

for (const [hash, title] of routes) {
  test(`route ${hash} renders and shows Leave now`, async ({ page }) => {
    await page.goto("/" + hash);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("button", { name: "Leave now" })).toBeVisible();
  });
}

test("unknown route goes to #/", async ({ page }) => {
  await page.goto("/#/nope");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Write it down. Keep it safe.");
  expect(page.url()).toMatch(/#\/$/);
});
