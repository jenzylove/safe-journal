import { expect, test } from "@playwright/test";

test("open a new journal, share link, nothing stored on the device", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/#/");
  await page.getByRole("link", { name: "Start my journal" }).first().click();
  await page.getByRole("button", { name: "Show my six words" }).click();
  const words = ((await page.locator("#words").textContent()) ?? "").split(" ");
  expect(words).toHaveLength(6);
  await expect(page.getByRole("button", { name: "Open my new journal" })).toBeDisabled();
  await page.locator("#w2").fill(words[1]!.toUpperCase());
  await page.locator("#w5").fill(" " + words[4]! + " ");
  await page.getByRole("button", { name: "Open my new journal" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Journal", { timeout: 30_000 });
  await expect(page.getByText("No entries yet.")).toBeVisible({ timeout: 45_000 });

  await page.getByRole("link", { name: "Share with a lawyer" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Share with a lawyer");
  await expect(page.getByText("You have no entries to share yet.")).toBeVisible();

  const storage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    idb: (await indexedDB.databases()).length,
  }));
  expect(storage).toEqual({ local: 0, session: 0, idb: 0 });
});
