import { expect, test } from "@playwright/test";

test("open a new journal, share link, nothing stored on the device", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/#/");
  await page.getByRole("button", { name: /Generate a passphrase/ }).click();
  await expect(page.locator("#passphrase")).toHaveValue(/\S+ \S+ \S+/);
  await expect(page.locator("#verdict")).toHaveText("This passphrase is strong.");
  await expect(page.locator("#gen-note")).toContainText("Write them down");

  await page.getByRole("button", { name: "Open journal" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Journal", { timeout: 30_000 });
  await expect(page.getByText("No entries yet.")).toBeVisible({ timeout: 45_000 });

  await page.getByRole("link", { name: "Share with a lawyer" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Share with a lawyer");
  const full = await page.locator('input[aria-label^="Full link"]').inputValue();
  expect(full).toContain("#/lawyer?a=0x");
  expect(full).toContain("&k=");
  const proofOnly = await page.locator('input[aria-label^="Proof only"]').inputValue();
  expect(proofOnly).toContain("#/lawyer?a=0x");
  expect(proofOnly).not.toContain("k=");

  const storage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    idb: (await indexedDB.databases()).length,
  }));
  expect(storage).toEqual({ local: 0, session: 0, idb: 0 });
});
