import { expect, test } from "@playwright/test";

const routes: Array<[string, string]> = [
  ["#/", "Open journal"],
  ["#/journal", "Journal"],
  ["#/write", "Write an entry"],
  ["#/share", "Share with a lawyer"],
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Open journal");
  expect(page.url()).toMatch(/#\/$/);
});
